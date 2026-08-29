import type { ElementDescriptor, FieldHandler, HandlerContext } from "./base"

/**
 * Async typeahead comboboxes — Greenhouse's "Where are you located?", school
 * and company pickers, LinkedIn's geo fields.
 *
 * You type, the widget queries, a listbox renders, and you must CLICK a
 * suggestion. Treating it as a <select> (which Stagehand did) reports success
 * while the field stays empty.
 *
 * Two behaviours learned from watching this churn on a live form:
 *  - It does NOT clear before the first attempt. Clearing up front is what made
 *    the field visibly empty and refill over and over.
 *  - If options render but none match, it STOPS. The server already returned its
 *    list; retyping a shorter query won't produce a different one.
 */
export const typeaheadHandler: FieldHandler = {
  name: "typeahead",
  priority: 50,

  canHandle(d: ElementDescriptor): boolean {
    if (d.role === "combobox") return true
    if (d.ariaAutocomplete) return true
    if (d.ariaControls && d.tag === "input") return true
    return /combobox|autocomplete|typeahead|select__input/i.test(d.className ?? "")
  },

  vmCode(ctx: HandlerContext): string {
    return `
const el = document.querySelector('[${ctx.targetAttr}="1"]');
if (!el) return { handled: true, filled: false, reason: 'element-vanished' };

const WANT = ${JSON.stringify(ctx.value)};
const OPT_ATTR = 'data-nq-opt';
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

// Type, then wait for the widget to actually react rather than for a fixed
// 1400ms. Returns whether anything moved: a false here means the listbox never
// rendered, which is a different failure from "rendered but nothing matched"
// and is reported as such below.
const typeInto = async (text) => {
  el.focus();
  if (setter) setter.call(el, text); else el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  const m = await waitForMutation(3000, 300);
  // A widget that responded instantly can still be mid-request; give a short
  // floor so a fast mutation (a spinner appearing) isn't mistaken for the list.
  if (m.changed && m.waitedMs < 350) await sleep(350 - m.waitedMs);
  return m.changed;
};

const readOptions = () => {
  document.querySelectorAll('[' + OPT_ATTR + ']').forEach(n => n.removeAttribute(OPT_ATTR));
  const seen = new Set();
  const out = [];
  Array.from(document.querySelectorAll(${JSON.stringify(ctx.optionSelector)})).forEach((n) => {
    const r = n.getBoundingClientRect();
    const s = getComputedStyle(n);
    if (!(r.width > 0 && r.height > 0) || s.display === 'none' || s.visibility === 'hidden') return;
    const text = (n.innerText || n.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!text || text.length > 160 || seen.has(text)) return;
    seen.add(text);
    n.setAttribute(OPT_ATTR, String(out.length));
    out.push(text);
  });
  return out.slice(0, 60);
};

// ─── Query order: SHORTEST first ───
//
// A place picker is filtered, not searched. Typing the whole profile value
// ("Bangalore, India") is usually too specific to match anything the widget
// offers — its own rows read "Bengaluru, Karnataka, India" — so the list comes
// back empty and there is nothing to click. Typing the bare city, or even its
// first few letters, is how a person actually uses one of these: wide enough
// that the right row appears, narrow enough to shorten the list.
//
// Ordered shortest-to-longest so the widest useful query runs first.
const lead = WANT.split(/[,\\-–—]/)[0].trim();
const queries = [];
if (lead) queries.push(lead);                        // "Bangalore"
if (lead.length > 4) queries.push(lead.slice(0, 3)); // "Ban" — the prefix a person types
if (!queries.some((q) => q.toLowerCase() === WANT.toLowerCase())) queries.push(WANT);

el.scrollIntoView({ block: 'center' });
el.click();
await sleep(rnd(250, 550));

let lastOptions = [];
let everReacted = false;
for (let qi = 0; qi < queries.length; qi++) {
  // Only clear when genuinely retrying a different query.
  if (qi > 0) { if (setter) setter.call(el, ''); else el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); await sleep(200); }
  const reacted = await typeInto(queries[qi]);
  if (reacted) everReacted = true;

  const options = readOptions();
  lastOptions = options;
  if (!options.length) continue;   // too narrow — widening may help

  // Match against the FULL value first: a three-letter query returns many
  // cities and only the complete value distinguishes them. Fall back to the
  // query itself so a deliberately widened search can still commit.
  let idx = bestIndex(WANT, options);
  if (idx < 0 && queries[qi] !== WANT) idx = bestIndex(queries[qi], options);
  if (idx < 0) {
    // Options exist but none matched. A later, different query may still
    // surface the right row, so only give up once every query has been tried.
    if (qi < queries.length - 1) continue;
    // Clear the query text before handing off: a half-typed city left in the
    // box reads as a filled field to the audit while being a value the portal
    // never offered.
    try {
      if (setter) setter.call(el, ''); else el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(120);
    } catch {}
    return { handled: true, filled: false, reason: 'no-matching-option', options, needsModelChoice: true };
  }

  const node = document.querySelector('[' + OPT_ATTR + '="' + idx + '"]');
  if (node) {
    node.click();
    // The listbox collapsing is itself the confirmation the click landed.
    await waitForMutation(1500, 200);
    document.querySelectorAll('[' + OPT_ATTR + ']').forEach(n => n.removeAttribute(OPT_ATTR));

    // ─── Did the selection actually commit? ───
    //
    // Several typeaheads write the real submitted value into a hidden companion
    // and treat the visible text box as decoration. Lever's location is the
    // canonical case: #location-input holds what you typed, and
    // #selected-location holds what gets submitted. Type a city without
    // committing a suggestion and the visible field looks perfect while the
    // hidden one stays empty — the server then rejects the whole application
    // with no clue which field was at fault.
    //
    // Only treated as a failure when a companion EXISTS and is empty. A widget
    // with no hidden companion is not suspicious, it is just a normal combobox.
    const wrap = el.closest('[class*="field"],[class*="question"],[class*="form-group"],[class*="select"],[class*="location"],fieldset,form');
    const companion = wrap && wrap.querySelector('input[type="hidden"][name],input[type="hidden"][id]');
    if (companion && !(companion.value || '').trim()) {
      return {
        handled: true, filled: false, reason: 'selection-not-committed',
        options, picked: options[idx],
      };
    }
    return { handled: true, filled: true, reason: 'picked-option', picked: options[idx], options };
  }
}

document.querySelectorAll('[' + OPT_ATTR + ']').forEach(n => n.removeAttribute(OPT_ATTR));

// ─── Never leave typed text behind in a picker ───
//
// Typing is how this widget is filtered, not how it is answered: the answer is
// the suggestion you click, and the widget stores it in its own canonical form
// (plus, on most portals, hidden companion fields — Greenhouse keeps latitude
// and longitude beside its location box).
//
// Leaving the query text in the input produces the worst possible outcome: the
// field LOOKS filled, so the audit passes and the submit gate opens, while the
// value is free text the portal never offered and the hidden companions are
// still empty. "Bangalore, India" sits in a box whose only valid values look
// like "Bengaluru, Karnataka, India", and the submission is rejected — or worse,
// accepted with an unusable location.
//
// Clearing it means the field reads as empty, which is true, and the submit gate
// blocks on it with a name the operator can act on.
try {
  if (setter) setter.call(el, ''); else el.value = '';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  await sleep(150);
} catch {}

// Three genuinely different failures, no longer collapsed into one:
//  - the widget never reacted at all         → 'widget-unresponsive'
//  - it reacted but rendered nothing          → 'no-options-rendered'
//  - options were there but the click missed  → 'click-failed'
const reason = lastOptions.length
  ? 'click-failed'
  : (everReacted ? 'no-options-rendered' : 'widget-unresponsive');
return { handled: true, filled: false, reason, options: lastOptions };
`
  },
}

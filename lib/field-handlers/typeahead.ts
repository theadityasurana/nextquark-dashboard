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

// ─── react-select, which mostly cannot be typed into at all ───
//
// Greenhouse renders its Yes/No screeners, its Country picker and its
// acknowledgements with react-select. Most are built with isSearchable={false},
// which means the thing that looks like a text input is a zero-width dummy that
// discards keystrokes: setting its .value and firing input changes nothing, no
// menu opens, and this handler reported widget-unresponsive on all six
// screeners of a live form while the questions stayed blank.
//
// react-select opens on MOUSEDOWN, not click and not focus, and it listens on
// the CONTROL rather than on the input. So the sequence is: mousedown the
// control to open the menu, read the options it renders, and mousedown the one
// we want — a plain a plain .click() misses because react-select commits its choice in
// its own mousedown handler before any click event is dispatched.
//
// The listbox id is published on the input's aria-controls while the menu is
// open, which scopes the option query exactly and beats guessing class names.
const rsControl = el.closest('[class*="select__control"],[class*="-control"]');
const looksReactSelect = !!rsControl
  || /^react-select-/.test(el.getAttribute('aria-controls') || '')
  || /^react-select-/.test(el.id || '')
  || (el.getAttribute('role') === 'combobox' && el.getAttribute('aria-haspopup') === 'true');

if (looksReactSelect) {
  const fire = (node, type) => {
    try {
      node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
    } catch { try { node.dispatchEvent(new Event(type, { bubbles: true })); } catch {} }
  };
  const opener = rsControl || el;
  // Captured before the menu opens: react-select swaps out the control and the
  // input as it re-renders, so anything resolved after the click can be stale.
  const rsShell = el.closest('[class*="select__container"],[class*="select-shell"]') || rsControl || el.parentElement;

  el.scrollIntoView({ block: 'center' });
  await sleep(rnd(120, 300));
  el.focus();
  fire(opener, 'mousedown');
  fire(opener, 'mouseup');
  await waitForMutation(2500, 200);

  // Scope to this widget's own listbox when it names one; otherwise fall back to
  // the portal-wide option selector.
  const listboxId = el.getAttribute('aria-controls') || '';
  const scoped = listboxId
    ? '#' + (window.CSS && CSS.escape ? CSS.escape(listboxId) : listboxId) + ' [role="option"], '
      + '#' + (window.CSS && CSS.escape ? CSS.escape(listboxId) : listboxId) + ' [class*="option"]'
    : '';

  const readScoped = () => {
    document.querySelectorAll('[' + OPT_ATTR + ']').forEach(n => n.removeAttribute(OPT_ATTR));
    const nodes = scoped ? Array.from(document.querySelectorAll(scoped)) : [];
    const list = nodes.length ? nodes : Array.from(document.querySelectorAll(${JSON.stringify(ctx.optionSelector)}));
    const seen = new Set(); const out = [];
    list.forEach((n) => {
      const r = n.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return;
      const text = (n.innerText || n.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text || text.length > 160 || seen.has(text)) return;
      seen.add(text); n.setAttribute(OPT_ATTR, String(out.length)); out.push(text);
    });
    return out.slice(0, 60);
  };

  let opts = readScoped();

  // ─── Narrow a long list before reading it ───
  //
  // react-select renders its menu alphabetically and this reader caps at 60
  // options, so on a ~250-entry country picker everything past the Bs is simply
  // absent: "India +91" was never in the list. bestIndex then fell through to
  // substring matching, where "british indian ocean territory 246" contains
  // "india", and the handler confidently committed the wrong dial code.
  //
  // A searchable react-select filters as you type, which is both how a person
  // uses it and the only way to get the wanted row into the rendered window.
  // isSearchable={false} widgets — the Yes/No screeners — render a readOnly
  // dummy input instead; typing into those does nothing, and their lists are
  // short enough that the first read already contains every option.
  const searchable = !el.readOnly && el.getAttribute('inputmode') !== 'none';
  if (searchable && bestIndex(WANT, opts) < 0) {
    const filterTerm = (WANT.split(/[,\\-–—]/)[0] || WANT).trim();
    if (filterTerm) {
      if (setter) setter.call(el, filterTerm); else el.value = filterTerm;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await waitForMutation(2500, 250);
      await sleep(200);
      const narrowed = readScoped();
      if (narrowed.length) opts = narrowed;
    }
  }

  // A searchable react-select shows everything on open; typing only narrows it.
  // If nothing rendered, it may be an async picker that needs a query first —
  // fall through to the typing path below rather than failing here.
  if (opts.length) {
    const idx = bestIndex(WANT, opts);
    if (idx < 0) {
      // Close the menu so the page is left as we found it.
      fire(opener, 'mousedown'); fire(opener, 'mouseup');
      document.querySelectorAll('[' + OPT_ATTR + ']').forEach(n => n.removeAttribute(OPT_ATTR));
      return { handled: true, filled: false, reason: 'no-matching-option', options: opts, needsModelChoice: true };
    }
    const node = document.querySelector('[' + OPT_ATTR + '="' + idx + '"]');
    if (node) {
      node.scrollIntoView({ block: 'nearest' });
      // mousedown is the one react-select acts on; the rest are for widgets that
      // want a full, ordinary click.
      fire(node, 'mousedown'); fire(node, 'mouseup'); fire(node, 'click');
      await waitForMutation(1500, 200);
      document.querySelectorAll('[' + OPT_ATTR + ']').forEach(n => n.removeAttribute(OPT_ATTR));

      // ─── Confirm from the committed value, never from the click ───
      //
      // Scope matters more than it looks. closest('[class*=select]') resolves to
      // the NEAREST match, which is .select__input-container — a subtree that
      // never contains the chosen value, because react-select renders that into
      // .select__single-value under a sibling value-container. So the check read
      // an empty node and reported selection-not-committed on answers that had
      // in fact landed. rsShell is captured above the control, before the click,
      // because react-select replaces nodes as it re-renders.
      //
      // Polled, not sampled once: the re-render is a frame or two behind the
      // mousedown, which is the same mistake in miniature.
      const readCommitted = () => {
        const box = rsShell || document;
        const single = box.querySelector('[class*="single-value"],[class*="singleValue"]');
        if (single) return ((single.innerText || single.textContent) || '').trim();
        // Builds that render no single-value node: the placeholder disappearing
        // is the same signal.
        const ctrl = box.querySelector('[class*="select__control"],[class*="-control"]') || box;
        if (ctrl.querySelector('[class*="placeholder"]')) return '';
        return ((ctrl.innerText || ctrl.textContent) || '').trim();
      };
      let committed = '';
      for (let i = 0; i < 12; i++) {
        committed = readCommitted();
        if (committed) break;
        await sleep(150);
      }
      if (committed) {
        return { handled: true, filled: true, reason: 'react-select-picked', picked: opts[idx], options: opts };
      }
      return { handled: true, filled: false, reason: 'selection-not-committed', picked: opts[idx], options: opts };
    }
  }
}

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

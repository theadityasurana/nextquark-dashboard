import type { ElementDescriptor, FieldHandler, HandlerContext } from "./base"

/**
 * Radio groups — "Will you require sponsorship?", "Are you authorized to work?",
 * and most EEO questions.
 *
 * Two things the old path got wrong: it enumerated only `input[type=radio]`
 * (missing Workday's `role="radio"` widgets entirely), and it clicked the input
 * rather than the label. Both are fixed here.
 *
 * On a mismatch it returns the options it actually saw, so the caller can hand
 * the real list to the model instead of letting it guess.
 */
export const radioHandler: FieldHandler = {
  name: "radio",
  priority: 20,

  canHandle(d: ElementDescriptor): boolean {
    if (d.type === "radio") return true
    if (d.role === "radio" || d.role === "radiogroup") return true
    // A fieldset is only ours if it actually contains radios; the dispatcher
    // passes `inDateContainer` for date wrappers, so this stays narrow.
    return d.tag === "fieldset"
  },

  vmCode(ctx: HandlerContext): string {
    return `
const host = document.querySelector('[${ctx.targetAttr}="1"]');
if (!host) return { handled: true, filled: false, reason: 'element-vanished' };

// The tagged node may be the group container OR one radio inside it.
const scope = host.tagName === 'INPUT'
  ? (host.closest('fieldset,[role="radiogroup"],[class*="field"],[class*="question"]') || document)
  : host;

// ─── A hidden radio is still a radio ───
//
// This filtered on the INPUT's own box, which assumes the input is the thing you
// see. Ashby's radio groups are the opposite: the real input is zero-sized and
// the visible control is a styled span beside it, driven through the associated
// label. Every option was therefore discarded and the handler returned
// no-radios-found on three answered questions in a row.
//
// What matters is whether the option is REACHABLE, so a radio counts when either
// it or the label pointing at it is rendered.
const rendered = (n) => {
  if (!n) return false;
  const b = n.getBoundingClientRect();
  return b.width > 0 || b.height > 0;
};
const labelFor = (r) => {
  if (r.id) {
    try {
      const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(r.id) : r.id) + '"]');
      if (l) return l;
    } catch {}
  }
  return r.closest('label');
};
const radios = Array.from(scope.querySelectorAll('input[type="radio"],[role="radio"]'))
  .filter(r => rendered(r) || rendered(labelFor(r)));

if (!radios.length) return { handled: true, filled: false, reason: 'no-radios-found' };

const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
const labelOf = (r) => {
  if (r.id) {
    const l = document.querySelector('label[for="' + esc(r.id) + '"]');
    if (l) return (l.textContent || '').replace(/\\s+/g, ' ').trim();
  }
  const anc = r.closest('label');
  if (anc) return (anc.textContent || '').replace(/\\s+/g, ' ').trim();
  return (r.getAttribute('aria-label') || r.value || '').trim();
};

const options = radios.map((r, i) => { r.setAttribute('data-nq-radio', String(i)); return labelOf(r); });

// Already answered?
const preIdx = radios.findIndex(readState);
if (preIdx >= 0) {
  radios.forEach(r => r.removeAttribute('data-nq-radio'));
  return { handled: true, filled: true, reason: 'already-selected', picked: options[preIdx] };
}

const idx = bestIndex(${JSON.stringify(ctx.value)}, options);
if (idx < 0) {
  radios.forEach(r => r.removeAttribute('data-nq-radio'));
  // Hand back the real options so the caller can ask the model to CHOOSE from
  // them, rather than letting it compose an answer that matches nothing.
  return { handled: true, filled: false, reason: 'no-matching-radio', options, needsModelChoice: true };
}

await sleep(rnd(180, 450));
const target = radios[idx];
// Click the LABEL when the input itself has no box: a click dispatched at a
// zero-sized element lands nowhere, and the label is what a person clicks.
const clickTarget = rendered(target) ? target : (labelFor(target) || target);
clickTarget.scrollIntoView({ block: 'center' });
clickVia(clickTarget);
await sleep(260);

const ok = readState(document.querySelectorAll('input[type="radio"],[role="radio"]')[0] ? radios[idx] : null)
  || radios.some(readState);
radios.forEach(r => r.removeAttribute('data-nq-radio'));
return { handled: true, filled: ok, reason: ok ? 'radio-selected' : 'radio-click-failed', picked: options[idx], options };
`
  },
}

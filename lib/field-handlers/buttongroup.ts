import type { ElementDescriptor, FieldHandler, HandlerContext } from "./base"

/**
 * Questions answered by clicking one of a row of buttons.
 *
 * Ashby renders every Boolean question this way:
 *
 *   <div class="ashby-application-form-field-entry">
 *     <label>Are you authorized to work in the country where the job is located?</label>
 *     <button aria-pressed="false">Yes</button>
 *     <button aria-pressed="false">No</button>
 *   </div>
 *
 * No `role="radio"`, no `role="radiogroup"`, no backing `<input>` — nothing the
 * radio handler recognises and nothing a DOM scan keyed on input/select/textarea
 * would even find. Both of OpenAI's knockout questions ("authorized to work",
 * "require sponsorship") sat unanswered for exactly this reason.
 *
 * The handler is given the CONTAINER, not a control, because there is no single
 * element that represents the question — only the container and the buttons
 * inside it.
 */
export const buttonGroupHandler: FieldHandler = {
  name: "buttongroup",
  // Above radio (20): a container tagged as a button group must not be claimed
  // by the fieldset branch of the radio handler.
  priority: 15,

  canHandle(d: ElementDescriptor): boolean {
    return d.role === "nq-buttongroup"
  },

  vmCode(ctx: HandlerContext): string {
    return `
const host = document.querySelector('[${ctx.targetAttr}="1"]');
if (!host) return { handled: true, filled: false, reason: 'element-vanished' };

const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
const isVis = (el) => {
  const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
  return (r.width > 0 || r.height > 0) && s.display !== 'none' && s.visibility !== 'hidden';
};
// Exact class tokens only. A \\b-based test matches across a hyphen, so
// "btn--active" and "is-active" read as pressed and an untouched Yes/No pair
// short-circuits below as already-selected — settled without ever being clicked.
const isOn = (b) => {
  if (!b) return false;
  if (b.getAttribute('aria-pressed') === 'true') return true;
  if (b.getAttribute('aria-checked') === 'true') return true;
  if (b.getAttribute('aria-selected') === 'true') return true;
  if (b.checked === true) return true;
  const cls = typeof b.className === 'string' ? b.className : '';
  return cls.split(/\\s+/).some((t) => t === 'selected' || t === 'active' || t === 'checked' || t === 'is-selected' || t === 'is-active');
};

// The option-vs-action predicate, applied identically everywhere. Re-querying
// without it left the post-click list indexed differently from the option list,
// so verification could land on an action button that happened to carry an
// "active" class and report the wrong pick as filled.
const isOptionButton = (b) => {
  const t = clean(b.innerText || b.getAttribute('aria-label'));
  return !!t && t.length <= 40 && !/^(upload|add|remove|replace|browse|choose file|cancel|back|next|submit)\\b/i.test(t);
};

const buttons = Array.from(host.querySelectorAll('button,[role="button"],[role="radio"],[role="checkbox"]'))
  .filter(isVis).filter(isOptionButton);

if (!buttons.length) return { handled: true, filled: false, reason: 'no-option-buttons' };

const options = buttons.map(b => clean(b.innerText || b.getAttribute('aria-label')));

// Already answered? Leave it alone. Clicking again would TOGGLE it off on every
// widget of this kind, which is the classic way an automated fill un-answers a
// question it had already got right.
const pre = buttons.findIndex(isOn);
if (pre >= 0) {
  return { handled: true, filled: true, reason: 'already-selected', picked: options[pre], options };
}

const idx = bestIndex(${JSON.stringify(ctx.value)}, options);
if (idx < 0) {
  return { handled: true, filled: false, reason: 'no-matching-option', options, needsModelChoice: true };
}

const target = buttons[idx];
target.scrollIntoView({ block: 'center' });
await sleep(rnd(200, 480));
target.click();
await waitForMutation(1500, 200);

// Verify against the live node — the widget re-renders on click, so re-query
// rather than trusting the reference we clicked.
const after = Array.from(host.querySelectorAll('button,[role="button"],[role="radio"],[role="checkbox"]'))
  .filter(isVis).filter(isOptionButton);
const okIdx = after.findIndex(isOn);
if (okIdx >= 0) {
  return { handled: true, filled: true, reason: 'clicked-option', picked: clean(after[okIdx].innerText), options };
}

// Some implementations only reflect state on a nested input.
const nested = host.querySelector('input:checked,[aria-checked="true"]');
if (nested) return { handled: true, filled: true, reason: 'clicked-option-nested-state', picked: options[idx], options };

return { handled: true, filled: false, reason: 'clicked-but-no-state-change', options, picked: options[idx] };
`
  },
}

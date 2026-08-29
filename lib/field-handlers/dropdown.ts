import type { ElementDescriptor, FieldHandler, HandlerContext } from "./base"

/**
 * Native <select> elements, single and multiple.
 *
 * Distinct from the typeahead handler: a native select has its options in the
 * DOM already, so there is nothing to type and no async list to wait for. The
 * option list is read directly and matched, and on a miss the real options are
 * returned for the model to choose from.
 */
export const dropdownHandler: FieldHandler = {
  name: "dropdown",
  priority: 30,

  canHandle(d: ElementDescriptor): boolean {
    return d.tag === "select"
  },

  vmCode(ctx: HandlerContext): string {
    return `
const el = document.querySelector('[${ctx.targetAttr}="1"]');
if (!el) return { handled: true, filled: false, reason: 'element-vanished' };

const all = Array.from(el.options);
// Index 0 is conventionally a "Select…" placeholder, not a real answer.
const options = all.map(o => (o.textContent || '').trim());

if (el.selectedIndex > 0 && (el.value || '').trim()) {
  return { handled: true, filled: true, reason: 'already-selected', picked: options[el.selectedIndex] };
}

const idx = bestIndex(${JSON.stringify(ctx.value)}, options);
if (idx < 0) {
  return { handled: true, filled: false, reason: 'no-matching-option', options, needsModelChoice: true };
}

await sleep(rnd(150, 400));
el.selectedIndex = idx;
// React and friends listen for these; setting selectedIndex alone is invisible.
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
// A native select can trigger a dependent field to appear (country → state).
// Waiting on the mutation rather than a flat 200ms means the next handler sees
// that field already in the DOM instead of missing it by a few milliseconds.
await waitForMutation(1200, 200);

const ok = el.selectedIndex === idx;
return { handled: true, filled: ok, reason: ok ? 'selected' : 'select-failed', picked: options[idx], options };
`
  },
}

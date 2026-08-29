import type { ElementDescriptor, FieldHandler, HandlerContext } from "./base"

/**
 * Checkboxes, including consent / certification boxes.
 *
 * The Ashby failure this fixes: the certification box was never ticked because
 * we called `.check()` on a visually-hidden input, which Playwright refuses with
 * "label intercepts pointer events". The label is the real click target on every
 * styled checkbox, so `clickVia` tries it first (see VM_PRELUDE).
 *
 * The second half is verification: state is re-read via `readState`, which
 * understands `aria-checked`, so an ARIA checkbox no longer reports as unticked
 * after being successfully ticked.
 */
export const checkboxHandler: FieldHandler = {
  name: "checkbox",
  priority: 10,

  canHandle(d: ElementDescriptor): boolean {
    if (d.type === "checkbox") return true
    // ARIA checkbox / switch with no native input behind it.
    return d.role === "checkbox" || d.role === "switch"
  },

  vmCode(ctx: HandlerContext): string {
    return `
const el = document.querySelector('[${ctx.targetAttr}="1"]');
if (!el) return { handled: true, filled: false, reason: 'element-vanished' };

if (readState(el)) return { handled: true, filled: true, reason: 'already-checked' };

// An explicit negative answer means leave it alone — not every checkbox
// should be ticked, and force-ticking one is a wrong answer, not a fix.
const want = ${JSON.stringify(ctx.value)};
if (/^(no|false|decline|unchecked|off)$/i.test(String(want).trim())) {
  return { handled: true, filled: true, reason: 'left-unchecked-by-answer' };
}

el.scrollIntoView({ block: 'center' });
await sleep(rnd(200, 500));
clickVia(el);
await sleep(280);

let ok = readState(document.querySelector('[${ctx.targetAttr}="1"]'));
if (!ok) {
  // Second attempt: dispatch a real click on the input itself.
  try {
    const again = document.querySelector('[${ctx.targetAttr}="1"]');
    again.click();
    await sleep(250);
    ok = readState(document.querySelector('[${ctx.targetAttr}="1"]'));
  } catch {}
}
return { handled: true, filled: ok, reason: ok ? 'checked' : 'check-failed' };
`
  },
}

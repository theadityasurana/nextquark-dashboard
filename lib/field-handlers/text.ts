import type { ElementDescriptor, FieldHandler, HandlerContext } from "./base"

/**
 * Plain text inputs and textareas — the catch-all, so it runs LAST.
 *
 * Uses the native value setter plus explicit input/change events: React's
 * synthetic event system ignores a direct `.value` assignment, which is why
 * values appeared to be set but vanished on blur.
 */
export const textHandler: FieldHandler = {
  name: "text",
  priority: 90,

  canHandle(d: ElementDescriptor): boolean {
    if (d.tag === "textarea") return true
    if (d.tag !== "input") return false
    const t = (d.type || "text").toLowerCase()
    return ["text", "email", "tel", "url", "number", "search", ""].includes(t)
  },

  vmCode(ctx: HandlerContext): string {
    return `
const el = document.querySelector('[${ctx.targetAttr}="1"]');
if (!el) return { handled: true, filled: false, reason: 'element-vanished' };

const WANT = ${JSON.stringify(ctx.value)};
if ((el.value || '').trim() === WANT.trim() && WANT.trim()) {
  return { handled: true, filled: true, reason: 'already-correct' };
}

const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

el.scrollIntoView({ block: 'center' });
el.focus();
await sleep(rnd(120, 320));

if (setter) setter.call(el, WANT); else el.value = WANT;
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
await sleep(rnd(100, 250));
el.blur();
el.dispatchEvent(new Event('blur', { bubbles: true }));
await sleep(180);

const got = (el.value || '').trim();
const ok = got.length > 0;
return { handled: true, filled: ok, reason: ok ? 'typed' : 'value-did-not-stick', picked: got };
`
  },
}

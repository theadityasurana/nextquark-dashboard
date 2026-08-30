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

let got = (el.value || '').trim();

// ─── A box that empties itself is a picker in disguise ───
//
// Lever's "Current location" looks like a plain text input — no role, no
// aria-controls, nothing typeahead recognises — so it lands here. Typing into it
// appears to work and then Lever CLEARS it on blur, because the real value lives
// in a hidden #selected-location that only a suggestion click sets. This handler
// reported value-did-not-stick three times in one run and the field stayed
// empty, which blocked the submit.
//
// Rather than reroute the field (HackerRank's location genuinely is free text and
// must keep working), recover only in the case that actually failed: the value
// vanished, so retype it and take the suggestion the widget offered.
if (!got) {
  el.focus();
  if (setter) setter.call(el, WANT); else el.value = WANT;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await waitForMutation(3000, 250);

  const opts = Array.from(document.querySelectorAll(${JSON.stringify(ctx.optionSelector)}))
    .filter((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const texts = opts.map((n) => (n.innerText || n.textContent || '').replace(/\\s+/g, ' ').trim());
  const idx = bestIndex(WANT, texts);
  if (idx >= 0) {
    const n = opts[idx];
    n.scrollIntoView({ block: 'nearest' });
    ['mousedown', 'mouseup', 'click'].forEach((t) => {
      try { n.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, button: 0 })); } catch {}
    });
    await waitForMutation(1500, 200);
    got = (el.value || '').trim();
    if (got) {
      return { handled: true, filled: true, reason: 'picked-suggestion', picked: texts[idx], options: texts };
    }
  }
  if (texts.length) {
    return { handled: true, filled: false, reason: 'no-matching-option', options: texts, needsModelChoice: true };
  }
}

const ok = got.length > 0;
return { handled: true, filled: ok, reason: ok ? 'typed' : 'value-did-not-stick', picked: got };
`
  },
}

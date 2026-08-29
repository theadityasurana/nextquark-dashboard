import { describe, it } from "vitest"
import fs from "fs"
import Kernel from "@onkernel/sdk"

/**
 * Dump how a form's field containers are actually built.
 *
 * Diagnostic only. The question it answers: for each labelled question on the
 * page, what interactive element carries the answer? A container with a label
 * and no <input> is a question rendered as something else — a button pair, a
 * div-radio group, a canvas — and that is exactly the shape a DOM scan keyed on
 * `input,select,textarea` reports as "not there".
 */
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
) as Record<string, string>

describe("dom dump", () => {
  it("reports the interactive element behind every labelled question", async () => {
    const url = process.env.E2E_URL!
    const kernel = new Kernel({ apiKey: env.KERNEL_API_KEY })
    const b = await kernel.browsers.create({ stealth: true, timeout_seconds: 180, start_url: url })
    try {
      await new Promise((r) => setTimeout(r, 9000))
      const res = await kernel.browsers.playwright.execute(b.session_id, {
        code: `
return await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const isVisible = (el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return (r.width > 0 || r.height > 0) && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  // Every container that looks like it holds one question.
  const containers = Array.from(document.querySelectorAll('[class*="field"],[class*="question"],[class*="form-group"],fieldset'))
    .filter(isVisible)
    // Keep only the innermost ones — a section also matches [class*="field"].
    .filter(c => !c.querySelector('[class*="fieldEntry"],[class*="field-entry"]'));

  return containers.map((c, i) => {
    const lbl = c.querySelector('label,legend,[class*="label"]');
    const inputs = Array.from(c.querySelectorAll('input,select,textarea')).filter(isVisible);
    const buttons = Array.from(c.querySelectorAll('button,[role="button"],[role="radio"],[role="checkbox"],[role="option"]')).filter(isVisible);
    return {
      i,
      cls: (typeof c.className === 'string' ? c.className : '').slice(0, 70),
      label: clean(lbl && lbl.textContent).slice(0, 70),
      inputs: inputs.map(el => ({
        tag: el.tagName.toLowerCase(), type: el.getAttribute('type'), role: el.getAttribute('role'),
        id: (el.id || '').slice(0, 44), ph: el.placeholder || '',
      })),
      buttons: buttons.map(el => ({
        tag: el.tagName.toLowerCase(), role: el.getAttribute('role'),
        text: clean(el.innerText || el.getAttribute('aria-label')).slice(0, 30),
        pressed: el.getAttribute('aria-pressed'), checked: el.getAttribute('aria-checked'),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 50),
        id: (el.id || '').slice(0, 44),
      })),
    };
  });
});
`,
        timeout_sec: 60,
      })
      for (const c of res.result as any[]) {
        if (!c.label && !c.inputs.length && !c.buttons.length) continue
        console.log(`\n[${c.i}] "${c.label}"   .${c.cls}`)
        for (const el of c.inputs) console.log(`      INPUT  <${el.tag}${el.type ? ` type=${el.type}` : ""}${el.role ? ` role=${el.role}` : ""}> id="${el.id}" ph="${el.ph}"`)
        for (const el of c.buttons) console.log(`      BUTTON <${el.tag}${el.role ? ` role=${el.role}` : ""}> "${el.text}" pressed=${el.pressed} checked=${el.checked} id="${el.id}" .${el.cls}`)
      }
    } finally {
      try { await kernel.browsers.deleteByID(b.session_id) } catch {}
    }
  })
})

import { describe, it } from "vitest"
import fs from "fs"
import Kernel from "@onkernel/sdk"
import { VM_DOM_HELPERS } from "../../lib/vm-dom"

/**
 * Why did the inventory scan drop this control?
 *
 * dump-dom says WHICH element carries an answer; dump-html says what the markup
 * is. Neither says why a control the scan can plainly see never reached the
 * inventory. This runs the scan's own helpers against every candidate and prints
 * the verdict of each filter in order, so the answer is read rather than guessed.
 */
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
) as Record<string, string>

describe("scan diagnostic", () => {
  it("reports which filter drops each candidate control", async () => {
    const url = process.env.E2E_URL!
    const kernel = new Kernel({ apiKey: env.KERNEL_API_KEY })
    const b = await kernel.browsers.create({ stealth: true, timeout_seconds: 180, start_url: url })
    try {
      await new Promise((r) => setTimeout(r, 9000))
      const res = await kernel.browsers.playwright.execute(b.session_id, {
        code: `
return await page.evaluate(() => {
${VM_DOM_HELPERS}
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const out = [];
  const cands = Array.from(document.querySelectorAll('fieldset,[role="radiogroup"],input[type="radio"]'));
  for (const el of cands) {
    const wrap = nqWrapperOf(el);
    out.push({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      id: (el.id || '').slice(0, 40),
      name: (el.getAttribute('name') || '').slice(0, 40),
      visible: isVisible(el),
      decoy: typeof nqIsDecoy === 'function' ? nqIsDecoy(el) : null,
      ghost: typeof nqIsGhost === 'function' ? nqIsGhost(el) : null,
      inPopup: typeof nqInPopup === 'function' ? nqInPopup(el) : null,
      key: typeof nqKeyOf === 'function' ? nqKeyOf(el) : null,
      label: nqLabelOf(el),
      wrapTag: wrap ? wrap.tagName.toLowerCase() + '.' + String(wrap.className).slice(0, 30) : null,
      wrapText: wrap ? nqTextWithoutOptions(wrap).slice(0, 70) : null,
    });
  }
  return out;
});
`,
        timeout_sec: 40,
      })
      for (const c of ((res.result as any) || [])) {
        console.log(
          `\n<${c.tag}${c.type ? " type=" + c.type : ""}> id="${c.id}" name="${c.name}"` +
          `\n   visible=${c.visible} decoy=${c.decoy} ghost=${c.ghost} inPopup=${c.inPopup}` +
          `\n   key=${c.key}` +
          `\n   label="${c.label}"` +
          `\n   wrap=${c.wrapTag}  wrapText="${c.wrapText}"`
        )
      }
    } finally {
      await kernel.browsers.deleteByID(b.session_id).catch(() => {})
    }
  })
})

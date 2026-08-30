import { describe, it } from "vitest"
import fs from "fs"
import Kernel from "@onkernel/sdk"

/**
 * Dump the raw markup of the containers whose question we cannot answer.
 *
 * dump-dom reports WHICH element carries an answer. When it reports none at all —
 * a labelled container with no input, no button and no ARIA option role — the
 * next question is simply "then what IS in there?", and only the markup answers
 * that. Set E2E_MATCH to a substring of the question.
 */
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
) as Record<string, string>

describe("html dump", () => {
  it("prints the markup of matching field containers", async () => {
    const url = process.env.E2E_URL!
    const match = process.env.E2E_MATCH || "relocate"
    const kernel = new Kernel({ apiKey: env.KERNEL_API_KEY })
    const b = await kernel.browsers.create({ stealth: true, timeout_seconds: 180, start_url: url })
    try {
      await new Promise((r) => setTimeout(r, 9000))
      const res = await kernel.browsers.playwright.execute(b.session_id, {
        code: `
return await page.evaluate((needle) => {
  const out = [];
  const all = Array.from(document.querySelectorAll('[class*="fieldEntry"],[class*="field-entry"],[class*="field"],fieldset'));
  for (const c of all) {
    const text = (c.innerText || '').replace(/\\s+/g, ' ').trim();
    if (!text.toLowerCase().includes(needle.toLowerCase())) continue;
    // Deepest container that still holds the question text.
    if (c.querySelector('[class*="fieldEntry"],[class*="field-entry"]')) continue;
    out.push({ text: text.slice(0, 120), html: c.outerHTML.slice(0, 2600) });
  }
  return out.slice(0, 2);
}, ${JSON.stringify(process.env.E2E_MATCH || "relocate")});
`,
        timeout_sec: 40,
      })
      for (const c of ((res.result as any) || [])) {
        console.log("\n===== " + c.text + "\n")
        console.log(c.html)
      }
    } finally {
      await kernel.browsers.deleteByID(b.session_id).catch(() => {})
    }
  })
})

import { describe, it } from "vitest"
import fs from "fs"
import Kernel from "@onkernel/sdk"

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")] })
) as Record<string, string>

describe("smartrecruiters frame probe", () => {
  it("reports where the form actually lives", async () => {
    const url = process.env.E2E_URL!
    const kernel = new Kernel({ apiKey: env.KERNEL_API_KEY })
    const b = await kernel.browsers.create({ stealth: true, timeout_seconds: 240, start_url: url })
    try {
      await new Promise((r) => setTimeout(r, 9000))
      const res = await kernel.browsers.playwright.execute(b.session_id, {
        code: `
const report = {};
report.startUrl = page.url();
// Click the apply control the way the pipeline does.
for (const sel of ['a:has-text("interested")', 'button:has-text("interested")']) {
  const loc = page.locator(sel);
  if (await loc.count() && await loc.first().isVisible().catch(() => false)) {
    await loc.first().click({ timeout: 8000 }).catch(() => {});
    break;
  }
}
await page.waitForTimeout(8000);
report.afterUrl = page.url();
report.frames = [];
for (const f of page.frames()) {
  const info = await f.evaluate(() => ({
    inputs: document.querySelectorAll('input,textarea,select').length,
    buttons: Array.from(document.querySelectorAll('button,a[role="button"],[role="button"]'))
      .map(b => (b.innerText || '').replace(/\\s+/g, ' ').trim()).filter(Boolean).slice(0, 14),
    bodyText: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 260),
  })).catch((e) => ({ err: String(e).slice(0, 80) }));
  report.frames.push({ url: f.url().slice(0, 120), ...info });
}
return report;
`,
        timeout_sec: 90,
      })
      console.log(JSON.stringify(res.result, null, 2))
    } finally {
      await kernel.browsers.deleteByID(b.session_id).catch(() => {})
    }
  }, 300000)
})

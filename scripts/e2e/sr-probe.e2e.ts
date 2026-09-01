import { describe, it } from "vitest"
import fs from "fs"
import Kernel from "@onkernel/sdk"

/**
 * What does a real browser actually see on a SmartRecruiters application?
 *
 * Three live runs stopped on SmartRecruiters with a form inventory of ZERO, and
 * the conclusion drawn from the HTTP responses alone — "the form never renders"
 * — is not something a `fetch` can establish: every SmartRecruiters apply URL
 * answers a plain fetch with 403, so the markup was never in evidence. This
 * walks the real entry path in a real browser and prints what is on the page at
 * each hop: the posting, the click that opens the application, and the form.
 *
 *   E2E_URL=<api or jobs smartrecruiters url> \
 *     npx vitest run --config scripts/e2e/vitest.e2e.config.ts scripts/e2e/sr-probe.e2e.ts
 */
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
) as Record<string, string>

const SNAPSHOT = `
return await page.evaluate(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };
  const label = (el) => (el.labels?.[0]?.innerText || el.getAttribute('aria-label') ||
    el.getAttribute('placeholder') || el.name || el.id || '').trim().slice(0, 60);
  const controls = Array.from(document.querySelectorAll('input,select,textarea'))
    .filter(vis).filter((e) => e.type !== 'hidden')
    .map((e) => \`\${e.tagName.toLowerCase()}[\${e.type || ''}] \${label(e)}\`);
  const buttons = Array.from(document.querySelectorAll('button,a[role=button],[class*=button],input[type=submit]'))
    .filter(vis).map((e) => (e.innerText || e.value || '').trim().replace(/\\s+/g, ' ')).filter(Boolean).slice(0, 25);
  return {
    url: location.href,
    title: document.title,
    frames: Array.from(document.querySelectorAll('iframe')).map((f) => f.src || '(srcdoc)'),
    forms: document.querySelectorAll('form').length,
    controlCount: controls.length,
    controls: controls.slice(0, 40),
    buttons,
    bodyText: document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 1200),
  };
});
`

describe("smartrecruiters entry probe", () => {
  it("reports what the browser sees at each hop of the apply path", async () => {
    const raw = process.env.E2E_URL!
    const { resolveApplyUrl } = await import("@/lib/portal-detector")
    const resolved = await resolveApplyUrl(raw)
    console.log(`raw      : ${raw}`)
    console.log(`resolved : ${resolved}`)

    const kernel = new Kernel({ apiKey: env.KERNEL_API_KEY })
    const b = await kernel.browsers.create({ stealth: true, timeout_seconds: 300, start_url: resolved })
    const snap = async (tag: string) => {
      const res = await kernel.browsers.playwright.execute(b.session_id, { code: SNAPSHOT, timeout_sec: 30 })
      console.log(`\n──── ${tag} ────`)
      console.log(JSON.stringify(res.result, null, 1))
      return res.result as any
    }
    try {
      await new Promise((r) => setTimeout(r, 9000))
      await snap("1. landing")

      // Click whatever opens the application, then look again.
      const clicked = await kernel.browsers.playwright.execute(b.session_id, {
        code: `
const names = [/i'?m interested/i, /apply now/i, /^apply$/i, /start application/i, /submit application/i];
for (const re of names) {
  const el = page.getByRole('button', { name: re }).or(page.getByRole('link', { name: re })).first();
  if (await el.count().catch(() => 0)) {
    try { await el.click({ timeout: 8000 }); await page.waitForTimeout(6000); return { clicked: String(re) } } catch (e) { }
  }
}
return { clicked: null };
`,
        timeout_sec: 60,
      })
      console.log(`\nclick attempt: ${JSON.stringify(clicked.result)}`)
      await snap("2. after opening the application")

      // Anything rendered inside a frame is invisible to the top-level snapshot.
      const inFrames = await kernel.browsers.playwright.execute(b.session_id, {
        code: `
const out = [];
for (const f of page.frames()) {
  if (f === page.mainFrame()) continue;
  try {
    out.push({ url: f.url(), controls: await f.locator('input:visible, select:visible, textarea:visible').count() });
  } catch (e) { out.push({ url: f.url(), error: String(e).slice(0, 120) }) }
}
return out;
`,
        timeout_sec: 30,
      })
      console.log(`\nchild frames: ${JSON.stringify(inFrames.result, null, 1)}`)
    } finally {
      await kernel.browsers.deleteByID(b.session_id).catch(() => {})
    }
  })
})

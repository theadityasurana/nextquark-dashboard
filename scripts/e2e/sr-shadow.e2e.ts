import { describe, it } from "vitest"
import fs from "fs"
import Kernel from "@onkernel/sdk"

/**
 * The SmartRecruiters application page renders its headings ("Personal
 * information", "Resume", "Next") but reports zero <form>s and zero
 * input/select/textarea elements. Either the controls are custom elements, or
 * they are inside shadow roots that `document.querySelectorAll` cannot see.
 * This settles which.
 */
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
) as Record<string, string>

describe("smartrecruiters shadow probe", () => {
  it("reports whether the controls live in shadow roots", async () => {
    const raw = process.env.E2E_URL!
    const { resolveApplyUrl } = await import("@/lib/portal-detector")
    const kernel = new Kernel({ apiKey: env.KERNEL_API_KEY })
    const b = await kernel.browsers.create({ stealth: true, timeout_seconds: 300, start_url: await resolveApplyUrl(raw) })
    try {
      await new Promise((r) => setTimeout(r, 8000))
      await kernel.browsers.playwright.execute(b.session_id, {
        code: `
const re = /i'?m interested/i;
const el = page.getByRole('button', { name: re }).or(page.getByRole('link', { name: re })).first();
const n = await el.count().catch(() => 0);
if (n) { await el.click({ timeout: 10000 }); await page.waitForTimeout(9000) }
return { candidates: n, url: page.url() };
`,
        timeout_sec: 60,
      })
      const res = await kernel.browsers.playwright.execute(b.session_id, {
        code: `
return await page.evaluate(() => {
  const hosts = [], tags = {};
  const walk = (root, depth) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.tagName.includes('-')) tags[el.tagName.toLowerCase()] = (tags[el.tagName.toLowerCase()] || 0) + 1;
      if (el.shadowRoot) {
        hosts.push({
          depth,
          host: el.tagName.toLowerCase(),
          mode: 'open',
          controls: el.shadowRoot.querySelectorAll('input,select,textarea').length,
          slots: el.shadowRoot.querySelectorAll('slot').length,
        });
        if (depth < 6) walk(el.shadowRoot, depth + 1);
      }
    }
  };
  walk(document, 0);
  const deepControls = [];
  const collect = (root) => {
    for (const c of root.querySelectorAll('input,select,textarea')) {
      deepControls.push(c.tagName.toLowerCase() + '[' + (c.type || '') + '] ' +
        (c.getAttribute('aria-label') || c.getAttribute('placeholder') || c.name || c.id || '').slice(0, 50));
    }
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) collect(el.shadowRoot);
  };
  collect(document);
  return {
    lightControls: document.querySelectorAll('input,select,textarea').length,
    shadowHosts: hosts.length,
    hosts: hosts.slice(0, 25),
    deepControlCount: deepControls.length,
    deepControls: deepControls.slice(0, 40),
    customTags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 15),
    contentEditable: document.querySelectorAll('[contenteditable="true"]').length,
    // If the controls are in neither the light DOM nor a shadow root, the markup
    // itself will say what they are.
    sampleMarkup: (() => {
      const h = Array.from(document.querySelectorAll('*')).find((e) => /personal information/i.test(e.textContent || '') && e.children.length < 8);
      const box = h && h.closest('section,div');
      return box ? box.outerHTML.slice(0, 1500) : '(not found)';
    })(),
  };
});
`,
        timeout_sec: 30,
      })
      console.log(JSON.stringify(res.result, null, 1))
    } finally {
      await kernel.browsers.deleteByID(b.session_id).catch(() => {})
    }
  })
})

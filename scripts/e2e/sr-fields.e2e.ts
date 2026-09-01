import { describe, it } from "vitest"
import fs from "fs"
import Kernel from "@onkernel/sdk"

/**
 * Where does a SmartRecruiters control's LABEL live?
 *
 * The controls are inside shadow roots, so a shadow-piercing scan will find
 * them — but finding a control is only half of it. The scan also has to name it,
 * and every naming route it has (label[for=], closest('label'), the wrapper's
 * label element) is written against a single flat document. This prints, for
 * each control, the host chain it sits under and the text available at each hop,
 * so the label rules can be written against what is actually there.
 */
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
) as Record<string, string>

describe("smartrecruiters field anatomy", () => {
  it("prints the host chain and candidate label text for every control", async () => {
    const { resolveApplyUrl } = await import("@/lib/portal-detector")
    const kernel = new Kernel({ apiKey: env.KERNEL_API_KEY })
    const b = await kernel.browsers.create({
      stealth: true, timeout_seconds: 300,
      start_url: await resolveApplyUrl(process.env.E2E_URL!),
    })
    try {
      await new Promise((r) => setTimeout(r, 8000))
      await kernel.browsers.playwright.execute(b.session_id, {
        code: `
const re = /i'?m interested/i;
const el = page.getByRole('button', { name: re }).or(page.getByRole('link', { name: re })).first();
if (await el.count().catch(() => 0)) { await el.click({ timeout: 10000 }); await page.waitForTimeout(9000) }
return page.url();
`,
        timeout_sec: 60,
      })
      const res = await kernel.browsers.playwright.execute(b.session_id, {
        code: `
return await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const deep = (sel) => {
    const out = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.matches(sel)) out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    return out;
  };
  // Walk outwards, crossing shadow boundaries via .host.
  const up = (el) => {
    const chain = [];
    let n = el;
    for (let i = 0; i < 12 && n; i++) {
      n = n.parentElement || (n.parentNode && n.parentNode.host) || null;
      if (!n) break;
      chain.push({
        tag: n.tagName.toLowerCase(),
        cls: clean(String(n.className || '')).slice(0, 50),
        shadowHost: !!n.shadowRoot,
        ownText: clean(n.textContent).slice(0, 70),
        label: (() => { const l = n.querySelector && n.querySelector('label,legend,[class*="label"]'); return l ? clean(l.textContent).slice(0, 60) : null })(),
      });
    }
    return chain;
  };
  return deep('input:not([type=hidden]),select,textarea').map((c) => ({
    tag: c.tagName.toLowerCase() + '[' + (c.type || '') + ']',
    id: c.id, name: c.name,
    ariaLabel: c.getAttribute('aria-label'),
    ariaLabelledBy: c.getAttribute('aria-labelledby'),
    placeholder: c.getAttribute('placeholder'),
    required: c.required || c.getAttribute('aria-required') === 'true',
    inShadow: c.getRootNode() !== document,
    rootHost: c.getRootNode().host ? c.getRootNode().host.tagName.toLowerCase() : '(document)',
    labelForInRoot: (() => {
      const r = c.getRootNode();
      if (!c.id || !r.querySelector) return null;
      const l = r.querySelector('label[for="' + c.id + '"]');
      return l ? clean(l.textContent).slice(0, 60) : null;
    })(),
    chain: up(c).slice(0, 7),
  }));
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

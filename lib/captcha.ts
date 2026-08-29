/**
 * CAPTCHA detection and solving, owned by us rather than the browser vendor.
 *
 * Two problems with the previous approach, and they are independent.
 *
 * **Detection was blind to invisible challenges.** `detectCaptcha` matched
 * keywords in agent chatter. reCAPTCHA v3 and Cloudflare Turnstile render no
 * widget and produce no text — they silently reject the form POST. A run
 * blocked by one of those was read as "submit clicked but not confirmed", so
 * the retry loop went hunting for a missing field that didn't exist.
 * {@link CAPTCHA_DETECT_CODE} walks the DOM for the five real families and
 * returns `{type, sitekey}` whether or not anything is on screen.
 *
 * **Solving depended on one vendor.** Kernel auto-solves, and when it doesn't
 * the run parks for a human. An independent solve path (CapSolver-compatible:
 * createTask → poll → inject) covers the invisible types Kernel is weakest on
 * and removes the single point of failure.
 *
 * The token injection is the non-obvious half. Setting the response textarea
 * is not enough for reCAPTCHA — the page's own callback has to fire, which
 * means walking `window.___grecaptcha_cfg.clients` for the short-named callback
 * function and invoking it with the token. That code is in
 * {@link buildInjectCode} and is family-specific.
 *
 * Detection-order note: hCaptcha elements also carry `data-sitekey`, so
 * hCaptcha MUST be tested before reCAPTCHA or every hCaptcha is misreported as
 * a reCAPTCHA and solved with the wrong task type.
 */

export type CaptchaType =
  | "hcaptcha"
  | "turnstile"
  | "recaptchav2"
  | "recaptchav3"
  | "funcaptcha"
  /** Turnstile's script is present but the widget hasn't rendered yet. */
  | "turnstile_script_only"

export interface CaptchaDetection {
  type: CaptchaType
  sitekey?: string
  url?: string
  /** reCAPTCHA v3 / Turnstile carry an action the token must be minted against. */
  action?: string
  cdata?: string
  note?: string
}

/**
 * The detector, as a page.evaluate body. Runs inside the Kernel VM.
 *
 * Deliberately ordered: hCaptcha → Turnstile → reCAPTCHA v3 → reCAPTCHA v2 →
 * FunCaptcha. Each family is tried by its own marker first and by a script-tag
 * fallback second, because several ATSes render the widget container only
 * after the challenge is actually triggered.
 */
export const CAPTCHA_DETECT_CODE = `
const detected = await page.evaluate(() => {
  const r = {};
  const url = window.location.href;

  // 1. hCaptcha — FIRST, because hCaptcha containers also expose data-sitekey
  //    and would otherwise be claimed by the reCAPTCHA branch below.
  const hc = document.querySelector('.h-captcha, [data-hcaptcha-sitekey]');
  if (hc) {
    r.type = 'hcaptcha';
    r.sitekey = hc.getAttribute('data-sitekey') || hc.getAttribute('data-hcaptcha-sitekey');
  }
  if (!r.type && document.querySelector('script[src*="hcaptcha.com"], iframe[src*="hcaptcha.com"]')) {
    const el = document.querySelector('[data-sitekey]');
    if (el) { r.type = 'hcaptcha'; r.sitekey = el.getAttribute('data-sitekey'); }
  }

  // 2. Cloudflare Turnstile — usually invisible.
  if (!r.type) {
    const cf = document.querySelector('.cf-turnstile, [data-turnstile-sitekey]');
    if (cf) {
      r.type = 'turnstile';
      r.sitekey = cf.getAttribute('data-sitekey') || cf.getAttribute('data-turnstile-sitekey');
      const a = cf.getAttribute('data-action'); if (a) r.action = a;
      const c = cf.getAttribute('data-cdata'); if (c) r.cdata = c;
    }
  }
  if (!r.type && document.querySelector('script[src*="challenges.cloudflare.com"]')) {
    r.type = 'turnstile_script_only';
    r.note = 'Turnstile script present but widget not yet rendered.';
  }

  // 3. reCAPTCHA v3 — no widget at all; the sitekey lives in the loader's
  //    render= query param. This is the one keyword detection could never see.
  if (!r.type) {
    const s = document.querySelector('script[src*="recaptcha"][src*="render="]');
    if (s) {
      const m = s.src.match(/render=([^&]+)/);
      if (m && m[1] !== 'explicit') { r.type = 'recaptchav3'; r.sitekey = m[1]; }
    }
  }

  // 4. reCAPTCHA v2 (checkbox or invisible).
  if (!r.type) {
    const rc = document.querySelector('.g-recaptcha');
    if (rc) { r.type = 'recaptchav2'; r.sitekey = rc.getAttribute('data-sitekey'); }
  }
  if (!r.type && document.querySelector('script[src*="recaptcha"]')) {
    const el = document.querySelector('[data-sitekey]');
    if (el) { r.type = 'recaptchav2'; r.sitekey = el.getAttribute('data-sitekey'); }
  }

  // 5. FunCaptcha / Arkose Labs.
  if (!r.type) {
    const fc = document.querySelector('#FunCaptcha, [data-pkey], .funcaptcha');
    if (fc) { r.type = 'funcaptcha'; r.sitekey = fc.getAttribute('data-pkey'); }
  }
  if (!r.type && document.querySelector('script[src*="arkoselabs"], script[src*="funcaptcha"]')) {
    const el = document.querySelector('[data-pkey]');
    if (el) { r.type = 'funcaptcha'; r.sitekey = el.getAttribute('data-pkey'); }
  }

  if (!r.type) return null;
  r.url = url;
  return r;
});
return detected;
`

/** CapSolver task types, keyed by detected family. Proxyless variants. */
export const TASK_TYPES: Record<string, string> = {
  hcaptcha: "HCaptchaTaskProxyLess",
  recaptchav2: "ReCaptchaV2TaskProxyLess",
  recaptchav3: "ReCaptchaV3TaskProxyLess",
  turnstile: "AntiTurnstileTaskProxyLess",
  funcaptcha: "FunCaptchaTaskProxyLess",
}

/** Whether we have a solver task type for this detection. */
export function isSolvable(d: CaptchaDetection | null): boolean {
  return !!d && d.type in TASK_TYPES
}

/**
 * The createTask payload for a detection.
 *
 * v3 needs a `pageAction` — the action string the page mints tokens against.
 * "submit" is the near-universal default on application forms, but a detected
 * action always wins.
 */
export function buildTaskPayload(clientKey: string, d: CaptchaDetection): Record<string, unknown> {
  const type = TASK_TYPES[d.type]
  const task: Record<string, unknown> = {
    type,
    websiteURL: d.url,
    websiteKey: d.sitekey,
  }
  if (d.type === "recaptchav3") task.pageAction = d.action || "submit"
  if (d.type === "turnstile" && (d.action || d.cdata)) {
    task.metadata = { ...(d.action ? { action: d.action } : {}), ...(d.cdata ? { cdata: d.cdata } : {}) }
  }
  return { clientKey, task }
}

/** Pull the solved token out of a getTaskResult body, per family. */
export function extractToken(type: CaptchaType, solution: Record<string, any> | undefined): string | null {
  if (!solution) return null
  if (type === "turnstile") return solution.token ?? null
  // reCAPTCHA and hCaptcha both return under gRecaptchaResponse.
  return solution.gRecaptchaResponse ?? solution.token ?? null
}

/**
 * Family-specific token injection, as a page.evaluate body.
 *
 * Writing the response field alone is not sufficient for reCAPTCHA: the site's
 * verification callback has to run or the form still sees an unsolved widget.
 * `___grecaptcha_cfg.clients` holds those callbacks under obfuscated one- and
 * two-character keys, so the only reliable way to fire one is to walk the
 * object graph and invoke every short-named function with the token. Bounded
 * to depth 4 so a cyclic graph can't hang the page.
 */
export function buildInjectCode(type: CaptchaType, token: string): string {
  const t = JSON.stringify(token)

  if (type === "recaptchav2" || type === "recaptchav3") {
    return `
await page.evaluate((token) => {
  document.querySelectorAll('[name="g-recaptcha-response"]').forEach(el => {
    el.value = token;
    el.style.display = 'block';
  });
  if (window.___grecaptcha_cfg) {
    const clients = window.___grecaptcha_cfg.clients || {};
    const walk = (obj, depth) => {
      if (depth > 4 || !obj) return;
      for (const k in obj) {
        try {
          const v = obj[k];
          if (typeof v === 'function' && k.length < 3) { try { v(token); } catch (e) {} }
          else if (v && typeof v === 'object') walk(v, depth + 1);
        } catch (e) {}
      }
    };
    for (const key in clients) walk(clients[key], 0);
  }
}, ${t});
return { injected: true };
`
  }

  if (type === "hcaptcha") {
    return `
await page.evaluate((token) => {
  const fields = document.querySelectorAll('[name="h-captcha-response"], textarea[name*="hcaptcha"], [name="g-recaptcha-response"]');
  fields.forEach(el => { el.value = token; el.style.display = 'block'; });
  document.querySelectorAll('iframe[data-hcaptcha-response]').forEach(f => f.setAttribute('data-hcaptcha-response', token));
}, ${t});
return { injected: true };
`
  }

  if (type === "turnstile") {
    return `
await page.evaluate((token) => {
  const inputs = document.querySelectorAll('[name="cf-turnstile-response"], input[name*="turnstile"]');
  inputs.forEach(el => { el.value = token; });
  // Turnstile widgets frequently render into a form without a pre-existing
  // input; create one so the POST actually carries the token.
  if (!inputs.length) {
    const form = document.querySelector('form');
    if (form) {
      const el = document.createElement('input');
      el.type = 'hidden';
      el.name = 'cf-turnstile-response';
      el.value = token;
      form.appendChild(el);
    }
  }
}, ${t});
return { injected: true };
`
  }

  // FunCaptcha / Arkose.
  return `
await page.evaluate((token) => {
  const inp = document.querySelector('#FunCaptcha-Token, input[name="fc-token"], input[name*="arkose"]');
  if (inp) inp.value = token;
}, ${t});
return { injected: true };
`
}

export interface SolveResult {
  solved: boolean
  token?: string
  /** Why it failed — surfaced to the operator, never swallowed. */
  reason: string
}

const SOLVER_BASE = process.env.CAPTCHA_SOLVER_BASE_URL || "https://api.capsolver.com"

/**
 * createTask → poll → token. Does NOT touch the browser; the caller injects.
 *
 * Polls every 3s up to `timeoutMs` (default 30s, ~10 polls). A CAPTCHA token
 * expires in roughly two minutes, so a solve that takes longer than this is
 * worth abandoning rather than waiting on — the caller re-detects and retries.
 */
export async function solveCaptcha(
  clientKey: string,
  detection: CaptchaDetection,
  timeoutMs = 30_000
): Promise<SolveResult> {
  if (!clientKey) return { solved: false, reason: "No CAPTCHA solver key configured" }
  if (!isSolvable(detection)) {
    return { solved: false, reason: `No solver task type for "${detection.type}"` }
  }
  if (!detection.sitekey) {
    return { solved: false, reason: `Detected ${detection.type} but could not read its sitekey` }
  }

  let taskId: string
  try {
    const res = await fetch(`${SOLVER_BASE}/createTask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildTaskPayload(clientKey, detection)),
    })
    const body = await res.json()
    if (body?.errorId && body.errorId > 0) {
      return { solved: false, reason: `Solver rejected the task: ${body.errorDescription || body.errorCode || "unknown"}` }
    }
    if (!body?.taskId) return { solved: false, reason: "Solver returned no task id" }
    taskId = body.taskId
  } catch (err) {
    return { solved: false, reason: `Solver createTask failed: ${err instanceof Error ? err.message : String(err)}` }
  }

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000))
    try {
      const res = await fetch(`${SOLVER_BASE}/getTaskResult`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey, taskId }),
      })
      const body = await res.json()
      if (body?.errorId && body.errorId > 0) {
        return { solved: false, reason: `Solver failed: ${body.errorDescription || body.errorCode}` }
      }
      if (body?.status === "ready") {
        const token = extractToken(detection.type, body.solution)
        if (!token) return { solved: false, reason: "Solver reported ready but returned no token" }
        return { solved: true, token, reason: "Solved" }
      }
      // status "processing" — keep polling.
    } catch {
      // A transient network error during polling should not abandon the task.
    }
  }
  return { solved: false, reason: `Solver did not return a token within ${Math.round(timeoutMs / 1000)}s` }
}

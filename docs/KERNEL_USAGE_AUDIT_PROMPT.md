# Prompt: Audit NextQuark's use of Kernel (kernel.sh / @onkernel/sdk)

> Paste everything below the line into the Kernel-docs agent.

---

## Your role

You are an expert on **Kernel (kernel.sh)** with full access to its documentation, SDK reference, changelog and best-practice guides.

Below is an exhaustive description of how a production system called **NextQuark** currently uses Kernel. It is a job-application automation platform: it takes a job posting URL plus a candidate profile, opens a Kernel browser, fills the ATS application form end to end, submits it, and confirms the submission.

**I want a rigorous engineering audit of this usage against what Kernel actually supports today.** Do not summarise my description back to me. Instead:

1. **Correctness** — Where am I using a Kernel API wrongly, relying on undocumented/deprecated behaviour, calling a method that has been superseded, or making an assumption the docs contradict? Quote the relevant doc.
2. **Capabilities I'm re-implementing** — Where have I hand-rolled something (CAPTCHA solving, file upload, concurrency limiting, DOM extraction, human-in-the-loop handoff, retry, state persistence, iframe traversal, session pooling) that Kernel already provides natively? Name the exact API.
3. **Architecture** — The biggest open question is *where the orchestration code should live* (see "The central question" below). Give me a clear recommendation with reasoning.
4. **Latency & cost** — What in this design is expensive in wall-clock time or in Kernel billing units, and what is the cheaper equivalent? Be specific about what Kernel actually bills for.
5. **Reliability & stealth** — What will break at scale, and what are the anti-detection best practices I'm missing?
6. **Answer every numbered question** in the "Specific questions" section at the end, individually, with a doc citation or an explicit "the docs don't cover this."

Finish with a **prioritised action list**: `[impact] [effort] change → why`. Be blunt about anything that is a bad idea.

---

## 1. Environment

| | |
|---|---|
| SDK | `@onkernel/sdk` ^0.93.0 (TypeScript) |
| Also installed | `@browserbasehq/stagehand` ^3.3.0 (v3, used in `LOCAL` mode over Kernel's CDP URL), `@browserbasehq/stagehand-v4` ^4.0.2 (installed but unused with Kernel) |
| Runtime | Next.js 16 API routes + cron jobs, deployed on **Vercel serverless** (Node). Not a long-lived server. |
| Datastore | Supabase (Postgres + storage) — logs, run timeline, locks, screenshots |
| LLMs | OpenRouter (primary) → Gemini → OpenAI fallback chain, called from *our* server, not from inside the browser |
| Alternate providers | The same interface is implemented for Browserbase and Browser Use; Kernel is one of three selectable backends |
| Scale target | Batches of job applications per candidate, several candidates concurrently, cron-triggered |

Entry point is a single ~6,500-line function:

```ts
fillJobApplicationWithKernel(portalUrl, userData, onStep, applicationId, userId): Promise<AutomationResponse>
```

Target ATSes: **Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters, BambooHR, Jobvite, LinkedIn**, plus arbitrary company career pages that embed one of these in an iframe.

---

## 2. Every Kernel API surface I currently touch

```ts
import Kernel, { ConflictError, RateLimitError, APIError } from "@onkernel/sdk"
const kernel = new Kernel({ apiKey })          // key stored per-tenant in Supabase settings

// ── capacity ──
kernel.organization.limits.retrieve()          // read max_concurrent_sessions (called via `as any`)

// ── profiles ──
kernel.profiles.create({ name })               // ConflictError swallowed as "already exists"

// ── sessions ──
kernel.browsers.create({
  stealth: true,
  timeout_seconds: 300 | 420 | 480 | 600,      // per-portal
  start_url: targetUrl,                        // saves a goto round-trip
  gpu: true,                                   // Workday + LinkedIn only
  proxy: { type: "residential", config: { country: "US" } },   // LinkedIn only; everything else uses default ISP/stealth
  profile: { name, save_changes: boolean },
  telemetry: {
    enabled: true,
    categories: ["captcha","page","console","system","connection","interaction","network","screenshot"],
    browser: {
      page: { enabled: true }, console: { enabled: true }, network: { enabled: true },
      interaction: { enabled: true }, screenshot: { enabled: true },
    },
  },
})
// → { session_id, cdp_ws_url, browser_live_view_url }

kernel.browsers.list({ status: "active" })     // legacy fallback for profile-in-use detection
kernel.browsers.deleteByID(sessionId)          // also the point at which save_changes state is persisted

// ── pools (Greenhouse / Lever / Ashby only) ──
kernel.browserPools.create({ name, size, stealth, timeout_seconds })   // 409 treated as success
kernel.browserPools.acquire(poolName, { acquire_timeout_seconds: 10 }) // null → fall back to a dedicated session
kernel.browserPools.release(poolName, { session_id, recreate: true })  // recreate to scrub the previous candidate's PII

// ── remote execution (the workhorse) ──
kernel.browsers.playwright.execute(sessionId, { code, timeout_sec })
// → { result, stdout, stderr, success, error }
// `code` is a generated JS string with `page` in scope, usually wrapping page.evaluate()

// ── telemetry ──
kernel.browsers.telemetry.stream(sessionId, { lastEventId })  // async iterator of { seq, event }

// ── replays ──
kernel.browsers.replays.start(sessionId)       // → { replay_id }
kernel.browsers.replays.stop(replayId, { id: sessionId })
kernel.browsers.replays.list(sessionId)        // → [{ replay_view_url }]
```

Note: `organization.limits`, `browserPools` and `browsers.telemetry.stream` are all reached through `as any` casts because the SDK types either don't expose them or don't match — **tell me whether these are the real, current, supported call shapes.**

---

## 3. The full run lifecycle, in order

### Phase 0 — Before a browser exists
1. Load API keys from Supabase (Kernel key, OpenRouter/Gemini/OpenAI, an optional CapSolver-compatible CAPTCHA key).
2. **Probe every LLM key** with a cheap request; dead providers are dropped from the fallback chain up front rather than discovered mid-fill.
3. Detect the portal from the URL (`Greenhouse`, `Workday`, …) and derive a per-portal config: `maxSteps`, session `timeout_seconds`, `residential` proxy on/off, `gpu` on/off, `domSettleTimeout`, and a wizard-page ceiling (3 for Greenhouse/Lever/Ashby, 8–9 for Workday/iCIMS).
4. **Dispatch gate**: an in-process `Semaphore` sized from `organization.limits.retrieve().max_concurrent_sessions × 0.75`, hard-capped at 5, defaulting to 2 if the call fails. This exists because a burst of queued jobs used to fire N `browsers.create` calls and everything past the plan limit was rejected mid-run. It is *per serverless instance*, so it is not a real global gate.

### Phase 1 — Getting a browser
- **Poolable portals (Greenhouse/Lever/Ashby)**: ensure a pool named `nq-<portal>` exists, then `acquire` with a 10s timeout. On success I get a warm browser, but I then have to `page.goto(targetUrl)` myself via `playwright.execute` because a pooled browser is wherever the last run left it. On failure/204 I fall back to a dedicated session. Reasoning for the split: pools load profiles **read-only** and don't honour `save_changes`, so they're only safe where nothing needs to persist.
- **Everything else**: acquire a per-user *profile slot* (a Supabase-backed pool of N named profiles, N = the concurrency limit, each row-locked). `profiles.create` the slot name, then `browsers.create` with `profile: { name, save_changes: <true only if we hold the lock> }`. If every slot is busy, fall back to a shared profile with `save_changes: false` and log the degradation loudly. There is also a legacy path that calls `browsers.list({status:"active"})` and checks `b.profile.save_changes` to decide safety.
- Start a replay: `browsers.replays.start(sessionId)`.
- Start a **fire-and-forget background telemetry consumer** (details in §4).
- Init **Stagehand v3** in `env: "LOCAL"` with `localBrowserLaunchOptions: { cdpUrl: cdp_ws_url }`. v3 injects its helpers via `Page.addScriptToEvaluateOnNewDocument`, which works over remote CDP; **v4 requires loading a Chrome extension from the local filesystem, which I believe is incompatible with a remote Kernel session** — please confirm or correct this.
- Wait for the `page_navigation_settled` telemetry event (with a 5s timeout fallback) rather than a fixed sleep.
- Write `browser_live_view_url` into the DB so a human operator can take over in the live view.

### Phase 2 — Reaching the actual form
- Direct board URL → maybe click "Apply", then `waitForApplicationForm`.
- Company career page → click "Apply", then `resolveEmbeddedForm`: enumerate `page.frames()`, filter out analytics noise by regex, match ATS domains (`greenhouse|lever|ashby|myworkdayjobs|icims|…`), read the iframe `src`, and **navigate the top-level page to the iframe URL** so everything afterwards runs in the main frame.
- **Pre-fill safety gate**: read the URL + body text and block on contractor-marketplace onboarding, talent-network signups, ID/selfie verification walls — anything that renders inputs but is not a job application.
- **Email-only postings**: if there is no form and the page names an address, send the application by email instead and end the run successfully.

### Phase 3 — Deterministic pre-fill (no LLM)
- Download the résumé to Node memory with axios; validate byte length and content-type (an HTML body means the storage URL 404'd).
- Generate one large JS program (`buildPreFillCode`) and run it in a **single `playwright.execute` call, `timeout_sec: 120`**. It fills name/email/phone/LinkedIn/portfolio/consent/work-auth/EEO with label-first, CSS-fallback, and native-setter strategies, and includes **human-typing simulation** — randomised per-keystroke delays, random pauses, paste-vs-type above a 120-character threshold.
- **Phone country code** as a separate hard gate: try flag triggers, `<select>` elements, ARIA comboboxes, then restore the dial code into a plain `<input type="tel">` if no picker exists.
- **Résumé upload**: base64 the buffer into a generated `playwright.execute` script, rebuild it as a `File`, and attach via `DataTransfer`/`setInputFiles` inside the VM, then read the DOM back to verify it registered. `timeout_sec: 90`. Retried up to 3× at the submit gate.

### Phase 4 — Form inventory (three tiers, cheapest first)
1. **DOM traversal** via `playwright.execute` — every visible control, its label, kind, required flag, options, and a stable key (`id:…`, `name:…`, `idx:…`, `btn:…`, `group:…`).
2. **Accessibility tree scan** — another `playwright.execute`, catches div-based radios and ARIA toggles with no backing `<input>`.
3. **Vision fallback** — screenshot + VLM, only when the first two leave the form unexplained.
- Overlaid on top: for Greenhouse I fetch the ATS's **own public JSON schema** over plain HTTP and join on the provider's field names, which gives authoritative labels/types/required flags/options and can skip the vision tier entirely.

### Phase 5 — Planning and filling
- All answers are resolved **before** the browser is touched: profile data → answer bank → policy routing → LLM generation. They are frozen in an "answer ledger" so a question asked twice always gets the identical answer, a field is settled exactly once, and each field gets at most 3 attempts across the whole run.
- The fill loop is pure execution. **Per field it makes 2–3 `playwright.execute` round trips:**
  1. **Describe** — tag the element with `data-nq-field`, read back tag/type/role/aria/autocomplete/`data-automation-id`, plus the label of the element it *actually* resolved.
  2. **Wrong-field guard** — if the resolved label doesn't match the planned label, refuse to write (a stale `idx:` key after a re-render is how a phone number lands in a name box).
  3. **Drive** — a Strategy-pattern handler per widget type (text, dropdown, typeahead, radio, checkbox, checkbox-group, button-group, date) emits widget-specific JS that is executed in the VM.
  4. **Verify** — a further `playwright.execute` reads the value back off the DOM, because nothing is trusted to have worked.
- Escalation ladder when the handler fails: ask the model to pick from the widget's *real* options → a "least-committal option" guess for required fields → optional model-authored driver code (screened for side effects, off by default) → last resort, `stagehand.act()` over the CDP connection, whose success is still DOM-verified because `act()` self-reports success on no-ops.
- A mid-fill audit re-scans for **dynamically revealed fields** (answering "yes" to sponsorship reveals a follow-up).

### Phase 6 — The wizard loop (multi-page applications)
Per page: check for new tabs (`page.context().pages()`, switch to newest) → scan → plan → fill → read the visible + disabled buttons → decide. The page is **fingerprinted from its URL plus its actual control keys** (a URL check reports every SPA wizard as stuck, since Workday/iCIMS swap the whole form without navigating). A repeated fingerprint means the advance click did nothing or the wizard bounced backwards. A greyed-out Submit triggers reading the portal's own validation messages, a targeted re-fill, and a re-check.

### Phase 7 — Challenges
- **CAPTCHA**, two independent detectors: a keyword scan of agent text, and a **structural DOM scan** that is the only thing that can see invisible reCAPTCHA v3 / Turnstile. Resolution order:
  1. My own external solver (CapSolver-compatible): solve out of band, then `playwright.execute` a **token-injection script**, wait 2s, and re-detect to prove it cleared.
  2. Fall back to **Kernel's own auto-solve**, awaited via the `captcha_solve_result` telemetry event with a 60s timeout.
  3. Fall back to a human, who takes over in the `browser_live_view_url` while the run polls Supabase for a status change.
- **OTP / email verification**: an inbound-webhook + API poll (45s) → **opening a second tab inside the same Kernel session** to read our OTP-manager admin panel out of the DOM → a human writing the code into the queue row (~3 min).

### Phase 8 — Submit and confirm
- Gate on three separate questions: did *we* settle every required field; does the *page* still show a required field empty; is there anything we knowingly couldn't do. Plus a hard résumé gate.
- Human-like scroll before clicking submit (randomised steps and pauses).
- Post-submit: read validation errors, detect **anti-bot / "looks automated" rejections** (terminal — never retried, since a resubmit deepens the block), one targeted re-fill + resubmit otherwise.
- Confirm via per-portal URL patterns and confirmation-text regexes, extract a confirmation ID, and for medium-confidence verdicts run an **independent LLM judge** over the evidence that can downgrade a false success.
- Diagnose failures into `{failureClass, rootCause, suggestedAction, permanent, portalFault}` so a closed posting never re-enters the retry queue and never trips the portal's circuit breaker.
- **Learned site knowledge**: distil what this run discovered about the domain, PII-gate it, store it, score it by outcome, and inject it into future runs on the same domain.

### Phase 9 — Teardown (`finally`, every exit path)
`replays.stop(replayId, {id: sessionId})` → `replays.list` for the `replay_view_url` → then either `browserPools.release(pool, {session_id, recreate: true})` or `browsers.deleteByID(sessionId)` → release the Supabase profile slot. Order matters: delete must come after replay stop, and `deleteByID` is what persists profile state.

---

## 4. Telemetry consumption in detail

A background async iterator over `browsers.telemetry.stream(sessionId, { lastEventId })`, started fire-and-forget, reconnecting up to 5 times with `Last-Event-ID` resume and exponential-ish backoff. Events handled:

- `captcha_solve_result` → resolves the CAPTCHA waiter; logs status/type/duration/error code
- `page_navigation`, `page_navigation_settled` → the settled event replaces a fixed post-`start_url` sleep
- `page_dom_content_loaded`, `page_crashed`
- `console_log`, `console_error`
- `network_response` (only `document|xhr|fetch`), `network_loading_failed`
- `proxy_error`
- `interaction_click`, `interaction_key` (every keystroke), `interaction_scroll_settled`
- `service_crashed`, `system_oom_kill` → treated as **fatal**, reject a promise that aborts the run
- `monitor_screenshot` → base64 PNG, throttled to one per 4s, uploaded to Supabase storage, attached to the run timeline; disabled permanently on first upload failure
- `monitor_disconnected` / `monitor_reconnected` / `monitor_reconnect_failed` (fatal), `cdp_disconnect`

Every event becomes a row in an `application_logs` table (batched, 25 rows / 1.2s flush).

---

## 5. The central question

**Every one of those `playwright.execute` calls is an HTTP round trip from a Vercel serverless function to Kernel.** There are **34 distinct `playwright.execute` call sites**, and a realistic 30-field application makes **90–150 of them in a single run** (describe + drive + verify per field, plus scans, audits, validation reads, control reads, tab checks, and submit).

So:

- Is `playwright.execute` intended to be used at this granularity, or is it meant for coarse, occasional scripts?
- Does each call re-establish a Playwright connection to the browser, or is there a warm/persistent path?
- Should I instead **connect Playwright directly over `cdp_ws_url` from my own process** and hold one connection for the whole run — and what are the trade-offs (latency, stability, stealth, Vercel egress/timeouts) versus `playwright.execute`?
- Or should the entire orchestrator be **deployed as a Kernel app/action** so the code runs co-located with the browser and the per-call round trip disappears? If so: what does that look like for a Next.js/Vercel product, how do apps get invoked and how do they stream progress back, what are the limits on runtime, memory, deps and secrets, and how would the human-in-the-loop pause (waiting minutes for an operator to solve a CAPTCHA or supply an OTP) work in that model?

I need a clear recommendation, not a list of options.

---

## 6. Specific questions

**Sessions & lifecycle**
1. Are `stealth`, `gpu`, `proxy`, `profile`, `telemetry`, `start_url` and `timeout_seconds` the current, correct `browsers.create` parameters? Anything I'm missing that matters (viewport, timezone/locale/geo matching the proxy, extensions, headful vs headless, region/data-residency)?
2. What exactly does `stealth: true` do, and what does it *not* do? Which of my hand-rolled anti-detection measures (human typing delays, randomised scroll, paste thresholds) does it make redundant?
3. Is `gpu: true` genuinely the right answer to canvas/WebGL fingerprinting, and what does it cost?
4. Residential vs the default ISP/stealth proxy: my current rule is residential **only** for LinkedIn, on the theory that ISP performs better against reCAPTCHA on Workday/iCIMS. Is that supported by anything real? What proxy options exist, how is proxy traffic billed, and should the browser's timezone/locale be pinned to the proxy's country?
5. What happens when `timeout_seconds` expires mid-run — is it a hard kill? Are profile changes still persisted? Can a session be extended in flight?
6. Is calling `deleteByID` required to persist a `save_changes: true` profile, or does it persist continuously?

**Profiles**
7. Kernel's own docs note that check-then-create on profiles is two requests. Is there a create-or-get, or a documented locking pattern, so I can delete my Supabase advisory-lock layer?
8. What are the real semantics of concurrent sessions on the same profile with `save_changes: true` — last-write-wins, error, silent corruption?
9. Is my "pool of N named profile slots per user" a sane pattern, or is there a first-class Kernel concept for it?
10. Can profile state be inspected, exported, pruned or expired? Do profiles grow unboundedly?

**Pools**
11. Confirm: pooled browsers load profiles **read-only** and ignore `save_changes`. Is that still true?
12. Is `release(..., { recreate: true })` the right way to prevent PII leaking between candidates, or is there a cheaper scrub that keeps the browser warm?
13. What does `acquire` do when the pool is saturated — 204, block, error? Is `acquire_timeout_seconds: 10` sensible, and is falling back to a dedicated session the intended behaviour?
14. Is there a separate pooled-session concurrency limit distinct from `max_concurrent_sessions`? I currently size the pool from the same number.
15. A pooled browser starts wherever the last run left it, so I `goto` explicitly. Is there a pool-level `start_url` or a reset-to-blank guarantee?
16. What is the billing model for warm pool capacity — am I paying for idle warm browsers?

**Remote execution**
17. Full contract for `playwright.execute`: what is in scope besides `page`? Is `context`/`browser` available? Does `page.frames()`, `page.context().pages()`, `setInputFiles`, `page.on(...)` all work? What is the max `code` size and max `timeout_sec`?
18. Is there a **batch** form — several scripts in one round trip — or a persistent/session-scoped script context so I stop re-shipping the same DOM helper library on every call?
19. My résumé upload base64-encodes the file into the generated script. Is there a proper file-upload API (upload to the session's filesystem, then `setInputFiles` by path)? What's the size limit on the current approach?
20. Best practice for iframes: I currently navigate the top-level page to the iframe's `src`. Is there a supported frame-targeting approach that keeps the parent context?

**Telemetry**
21. Is consuming `telemetry.stream` as a fire-and-forget async iterator inside a **serverless function** supported? What happens when the function is suspended or the connection is dropped mid-run? Is `Last-Event-ID` resume guaranteed gapless?
22. Are the event type names I listed in §4 the complete and current set? Any high-value events I'm ignoring (form submissions, downloads, dialogs, auth challenges, request interception)?
23. `monitor_screenshot` at one frame per 4 seconds for a 5-minute run: what does this cost in bandwidth and billing, and is there a server-side sampling/quality control instead of my client-side throttle?
24. Is there a pull/replay-based telemetry API for after the fact, so I don't need a live consumer at all?
25. Which events are genuinely fatal? I treat `service_crashed`, `system_oom_kill`, `page_crashed` and `monitor_reconnect_failed` as unrecoverable — right call?

**CAPTCHA & challenges**
26. How does Kernel's built-in CAPTCHA solving work — always on with `stealth`, or opt-in? Which types (reCAPTCHA v2/v3/Enterprise, hCaptcha, Turnstile, press-and-hold)? Typical latency and success rate?
27. Does injecting an **externally solved token** via `playwright.execute` conflict with or confuse Kernel's own solver? Should I disable one? Which should run first?
28. Is `captcha_solve_result` emitted for invisible challenges that never render a widget?
29. Is the live view the intended human-takeover mechanism for a long pause (minutes), and does a session survive being idle while a human works in it? Can I pause the session timeout during a handoff?

**Concurrency, limits & errors**
30. Is `organization.limits.retrieve()` → `max_concurrent_sessions` the correct, supported way to read capacity? Are there other limits I should read (pools, profiles, execute rate, replay storage)?
31. What does Kernel return when I exceed concurrency — which error class, is it retryable, is there a `Retry-After`? Is there a server-side queue so I can stop maintaining my own semaphore?
32. My dispatch gate is per serverless instance, so N instances = N× the intended concurrency. Does Kernel offer anything distributed here, or must this stay on my side?
33. Complete taxonomy of `ConflictError` / `RateLimitError` / `APIError`, with the recommended retry policy per class. Does the SDK retry internally already?
34. Is a single `Kernel` client instance per invocation correct on serverless, or should it be reused/pooled?

**Replays & observability**
35. What do replays cost, how long are they retained, and is `stop` before `deleteByID` required? Is there any overhead to recording?
36. Anything in Kernel's observability (traces, session inspector, structured run records) that would replace my hand-rolled `application_logs` + run-timeline tables?

**Stagehand & agents**
37. Is my claim correct that **Stagehand v4 can't be used with a remote Kernel session** because it loads a Chrome extension from the local filesystem — and if so, does Kernel support extension loading in a way that unblocks v4?
38. Is `env: "LOCAL"` + `localBrowserLaunchOptions.cdpUrl` the recommended Stagehand-on-Kernel wiring, or is there a first-party integration?
39. Does Kernel offer its own agent / computer-use layer that would replace Stagehand as my last-resort fill mechanism?

**Cost**
40. Give me the precise billing units — session wall-clock, pool warm time, proxy bandwidth, CAPTCHA solves, replays, telemetry, `playwright.execute` calls — and rank my design's cost drivers. What single change cuts my per-application cost the most?

---

## 7. What "good" looks like for me

- A **submitted** application, confirmed with a reference ID, on the first attempt.
- Median run well under the current several-minutes-per-application.
- Zero cross-candidate data leakage.
- Every failure explainable from logs without opening a replay.
- Nothing hand-rolled that Kernel already does better.

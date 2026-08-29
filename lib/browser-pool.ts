/**
 * Pre-warmed browser pools, for the portals that don't need to remember anything.
 *
 * Every run currently pays for a cold browser: create the session, wait for
 * Chrome, wait for the start URL. Kernel can keep browsers warm in a pool and
 * hand one over immediately, which removes that wait entirely.
 *
 * ── THE CONSTRAINT THAT SHAPES THIS ──
 *
 * A pool loads its profile **read-only and never writes changes back** — Kernel
 * says so explicitly, and `save_changes` is not honoured on a pooled browser.
 * So a pool cannot be used where the point of the session is to *accumulate*
 * state: a LinkedIn login, a Workday candidate account, anything where the
 * cookies we leave behind are what makes the next run work.
 *
 * That splits the fleet honestly rather than pretending one mechanism fits:
 *
 *   Greenhouse / Lever / Ashby   direct board URLs, no account, nothing to
 *                                remember  → pooled, warm, fast
 *   Workday / iCIMS / LinkedIn   accounts, logins, persisted cookies
 *                                → dedicated session with a writable profile
 *
 * ── BACKPRESSURE COMES FREE ──
 *
 * `acquire` long-polls and returns 204 when nothing is available, rather than
 * failing. That is exactly the backpressure the dispatcher wants: ask, wait,
 * and if the pool is genuinely saturated, fall back to a dedicated session
 * instead of queueing forever.
 */

import type Kernel from "@onkernel/sdk"

/**
 * Portals whose applications are stateless.
 *
 * The test is not "is it simple" — it is "does anything we learn in this
 * session need to survive it". These three serve a public form at a direct URL
 * and never ask the candidate to sign in, so the answer is no.
 */
export const POOLABLE_PORTALS = new Set(["Greenhouse", "Lever", "Ashby"])

export function isPoolable(portalName: string): boolean {
  return POOLABLE_PORTALS.has(portalName)
}

/** Pool name per portal — separate pools so their configs can diverge. */
export function poolNameFor(portalName: string): string {
  return `nq-${portalName.toLowerCase()}`
}

export interface PooledBrowser {
  sessionId: string
  cdpWsUrl: string
  liveViewUrl: string | null
  /** True when this came from a pool; false when we fell back to a fresh session. */
  pooled: boolean
  /** Pool this browser belongs to, for the release call. */
  poolName: string | null
}

export interface PoolConfig {
  /** How many warm browsers to keep. Bounded by the plan's pooled-session limit. */
  size: number
  stealth: boolean
  timeoutSeconds: number
}

/**
 * Make sure the pool exists, then hand back a warm browser.
 *
 * Returns null on any failure — a missing pool, a saturated pool, a plan
 * without pooled sessions. Null means "use a dedicated session", never "fail
 * the run": pooling is a latency optimisation and must never become a
 * dependency.
 */
export async function acquirePooledBrowser(
  kernel: InstanceType<typeof Kernel>,
  portalName: string,
  config: PoolConfig,
  onLog?: (level: "info" | "warn", message: string) => Promise<void> | void
): Promise<PooledBrowser | null> {
  if (!isPoolable(portalName)) return null

  const poolName = poolNameFor(portalName)
  const pools = (kernel as any).browserPools
  if (!pools?.acquire) return null

  // Ensure the pool exists. A pool that is already there is the common case, so
  // a conflict on create is success, not an error.
  try {
    await pools.create({
      name: poolName,
      size: config.size,
      stealth: config.stealth,
      timeout_seconds: config.timeoutSeconds,
    })
    await onLog?.("info", `Created browser pool "${poolName}" with ${config.size} warm browser(s)`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 409 / already exists is expected on every run after the first.
    if (!/409|conflict|already exists/i.test(msg)) {
      await onLog?.("warn", `Could not create pool "${poolName}" (${msg.slice(0, 160)}) — using a dedicated session`)
      return null
    }
  }

  try {
    // Short poll. If nothing is warm within this window the pool is saturated,
    // and waiting longer costs more than just starting a browser ourselves.
    const res = await pools.acquire(poolName, { acquire_timeout_seconds: 10 })
    if (!res?.session_id || !res?.cdp_ws_url) {
      await onLog?.("info", `Pool "${poolName}" had nothing warm — starting a dedicated session`)
      return null
    }
    await onLog?.("info", `Took a warm browser from pool "${poolName}" (session ${res.session_id})`)
    return {
      sessionId: res.session_id,
      cdpWsUrl: res.cdp_ws_url,
      liveViewUrl: res.browser_live_view_url ?? null,
      pooled: true,
      poolName,
    }
  } catch (err) {
    await onLog?.("warn", `Pool acquire failed (${err instanceof Error ? err.message : String(err)}) — using a dedicated session`)
    return null
  }
}

/**
 * Give a pooled browser back, recreating it so the next run starts clean.
 *
 * `recreate` matters here specifically: a browser that just filled someone's
 * job application is holding their name, email and résumé in form state and
 * history. Handing that to the next candidate's run would be a data leak
 * between users, so the browser is destroyed and re-warmed rather than reused
 * as-is.
 */
export async function releasePooledBrowser(
  kernel: InstanceType<typeof Kernel>,
  browser: PooledBrowser,
  onLog?: (level: "info" | "warn", message: string) => Promise<void> | void
): Promise<void> {
  if (!browser.pooled || !browser.poolName) return
  try {
    await (kernel as any).browserPools.release(browser.poolName, {
      session_id: browser.sessionId,
      recreate: true,
    })
    await onLog?.("info", `Returned the browser to pool "${browser.poolName}" (recreated clean)`)
  } catch (err) {
    // If release fails the browser eventually times out on its own; the pool
    // refills. Worth a warning, not worth failing a completed application.
    await onLog?.("warn", `Could not release the pooled browser: ${err instanceof Error ? err.message : String(err)}`)
  }
}

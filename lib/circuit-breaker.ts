/**
 * Per-portal circuit breaker.
 *
 * When a portal starts hard-failing — a layout change broke our selectors,
 * Greenhouse is down, our proxy pool is blocked — every queued application for
 * that portal marches into the same wall, each one paying for a browser session,
 * a proxy, and LLM calls before failing identically. The breaker notices the run
 * of failures and stops dispatch to that portal until a probe shows it working.
 *
 * Standard three-state machine:
 *
 *   closed  — normal. Failures accumulate; `threshold` consecutive ones open it.
 *   open    — dispatch refused. After `cooldownMs`, the next ask goes to half-open.
 *   halfOpen— one probe run allowed through. Success closes it and clears the
 *             count; failure re-opens it for another cooldown.
 *
 * The transition logic is pure ({@link transition}, {@link decide}) and
 * unit-tested; persistence lives in the caller so this file stays DB-free.
 */

export type BreakerState = "closed" | "open" | "halfOpen"

export interface BreakerRecord {
  portal: string
  state: BreakerState
  /** Consecutive failures since the last success. Reset to 0 on any success. */
  consecutiveFailures: number
  /** When the breaker last opened — the clock the cooldown runs against. */
  openedAt: string | null
  lastFailureAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
}

export interface BreakerConfig {
  /** Consecutive failures that trip a closed breaker open. */
  threshold: number
  /** How long an open breaker stays open before allowing a probe. */
  cooldownMs: number
}

export const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  // Three in a row: enough that a single flaky posting or one bad résumé URL
  // can't trip the portal for everyone, low enough to catch a real outage fast.
  threshold: 3,
  // Ten minutes — long enough for a transient upstream blip to clear, short
  // enough that a recovered portal isn't sidelined for a whole queue cycle.
  cooldownMs: 10 * 60 * 1000,
}

export function initBreaker(portal: string): BreakerRecord {
  return {
    portal,
    state: "closed",
    consecutiveFailures: 0,
    openedAt: null,
    lastFailureAt: null,
    lastSuccessAt: null,
    lastError: null,
  }
}

export interface BreakerDecision {
  /** Whether a run may be dispatched to this portal right now. */
  allow: boolean
  /** The state to persist — a cooldown expiry moves open → halfOpen. */
  record: BreakerRecord
  /** Operator-facing explanation when `allow` is false. */
  reason: string | null
  /** Milliseconds until the next probe is permitted, when open. */
  retryInMs: number | null
}

/**
 * Whether to let a run through, and the (possibly advanced) breaker state.
 *
 * Pure: `now` is injected so the cooldown is testable without waiting.
 * Callers must persist `record` — that is what moves open → halfOpen so exactly
 * one probe, not every waiting run, is admitted when the cooldown expires.
 */
export function decide(
  record: BreakerRecord,
  config: BreakerConfig = DEFAULT_BREAKER_CONFIG,
  now: Date = new Date()
): BreakerDecision {
  if (record.state === "closed") {
    return { allow: true, record, reason: null, retryInMs: null }
  }

  if (record.state === "halfOpen") {
    // The probe was already admitted by whoever moved us here.
    return { allow: true, record, reason: null, retryInMs: null }
  }

  // Open: allow a single probe once the cooldown has elapsed.
  const openedAt = record.openedAt ? new Date(record.openedAt).getTime() : 0
  const elapsed = now.getTime() - openedAt
  if (elapsed >= config.cooldownMs) {
    return {
      allow: true,
      record: { ...record, state: "halfOpen" },
      reason: null,
      retryInMs: null,
    }
  }

  const retryInMs = config.cooldownMs - elapsed
  return {
    allow: false,
    record,
    reason: `${record.portal} breaker is open after ${record.consecutiveFailures} consecutive failures${record.lastError ? ` (last: ${record.lastError})` : ""}.`,
    retryInMs,
  }
}

/** Fold a run's outcome into the breaker state. Pure. */
export function transition(
  record: BreakerRecord,
  outcome: { success: boolean; error?: string | null },
  config: BreakerConfig = DEFAULT_BREAKER_CONFIG,
  now: Date = new Date()
): BreakerRecord {
  const at = now.toISOString()

  if (outcome.success) {
    // Any success — probe or normal — fully closes the breaker. A portal that
    // works is a portal we should be using.
    return {
      ...record,
      state: "closed",
      consecutiveFailures: 0,
      openedAt: null,
      lastSuccessAt: at,
      lastError: null,
    }
  }

  const failures = record.consecutiveFailures + 1
  const base = {
    ...record,
    consecutiveFailures: failures,
    lastFailureAt: at,
    lastError: outcome.error ?? record.lastError,
  }

  // A failed probe sends us straight back to open for a fresh cooldown, without
  // waiting to re-accumulate the threshold.
  if (record.state === "halfOpen") {
    return { ...base, state: "open", openedAt: at }
  }

  if (failures >= config.threshold) {
    return { ...base, state: "open", openedAt: record.openedAt ?? at }
  }

  return base
}

/** Compact health label for the Overview strip. */
export function healthLabel(
  record: BreakerRecord,
  config: BreakerConfig = DEFAULT_BREAKER_CONFIG,
  now: Date = new Date()
): { label: string; tone: "ok" | "degraded" | "down" } {
  if (record.state === "open") {
    const { retryInMs } = decide(record, config, now)
    const mins = retryInMs != null ? Math.max(1, Math.ceil(retryInMs / 60_000)) : null
    return { label: mins ? `paused · retry in ${mins}m` : "paused", tone: "down" }
  }
  if (record.state === "halfOpen") return { label: "probing", tone: "degraded" }
  if (record.consecutiveFailures > 0) {
    return { label: `${record.consecutiveFailures} recent failure${record.consecutiveFailures === 1 ? "" : "s"}`, tone: "degraded" }
  }
  return { label: "healthy", tone: "ok" }
}

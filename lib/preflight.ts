/**
 * The pre-flight gate — the single place that decides whether an application is
 * worth dispatching, and the persistence for the per-portal circuit breaker.
 *
 * Runs before any browser session is created. Four checks, cheapest first:
 *
 *   1. portal detection  — do we recognize this ATS confidently enough to drive it?
 *   2. knockouts         — is this application explicitly disqualified?
 *   3. fill coverage     — can this profile even reach the submit button?
 *   4. circuit breaker   — is this portal currently failing every application?
 *
 * Only 1, 2 and 4 can block. Low coverage is recorded and surfaced but does not
 * block on its own, except when a *blocking* field (résumé, email, phone…) is
 * missing — that is a guaranteed stall at the submit gate, so it is treated as a
 * hard block rather than spending a session to rediscover it.
 *
 * The pure logic lives in knockouts.ts / fill-coverage.ts / circuit-breaker.ts /
 * portal-detector.ts; this module is the IO seam that composes them.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { evaluateKnockouts, type KnockoutCandidate, type KnockoutJob, type Knockout } from "./knockouts"
import { estimateCoverage, type CoverageProfile, type CoverageReport } from "./fill-coverage"
import { detectPortalScored, CONFIDENT_THRESHOLD } from "./portal-detector"
import {
  decide,
  DEFAULT_BREAKER_CONFIG,
  initBreaker,
  transition,
  type BreakerRecord,
} from "./circuit-breaker"

export type BlockKind = "knockout" | "coverage" | "portal" | "breaker"

export interface PreflightResult {
  /** False when the run must not be dispatched. */
  allow: boolean
  blockKind: BlockKind | null
  /** Operator-facing reason, shown on the queue card. */
  reason: string | null
  /** Whether a blocked run should be retried later (breaker) or is terminal. */
  retryable: boolean
  portalName: string | null
  portalConfidence: number
  knockouts: Knockout[]
  knockoutBlocked: boolean
  coverage: CoverageReport
}

// ─── Breaker persistence ───

function rowToRecord(portal: string, row: Record<string, unknown> | null): BreakerRecord {
  if (!row) return initBreaker(portal)
  return {
    portal,
    state: (row.state as BreakerRecord["state"]) ?? "closed",
    consecutiveFailures: Number(row.consecutive_failures ?? 0),
    openedAt: (row.opened_at as string) ?? null,
    lastFailureAt: (row.last_failure_at as string) ?? null,
    lastSuccessAt: (row.last_success_at as string) ?? null,
    lastError: (row.last_error as string) ?? null,
  }
}

async function readBreaker(supabase: SupabaseClient, portal: string): Promise<BreakerRecord> {
  const { data } = await supabase.from("portal_breakers").select("*").eq("portal", portal).maybeSingle()
  return rowToRecord(portal, data)
}

async function writeBreaker(supabase: SupabaseClient, r: BreakerRecord): Promise<void> {
  await supabase.from("portal_breakers").upsert(
    {
      portal: r.portal,
      state: r.state,
      consecutive_failures: r.consecutiveFailures,
      opened_at: r.openedAt,
      last_failure_at: r.lastFailureAt,
      last_success_at: r.lastSuccessAt,
      last_error: r.lastError,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "portal" }
  )
}

/**
 * Record a finished run against its portal's breaker. Call once per run, after
 * the outcome is known. Best-effort: breaker bookkeeping must never fail a run
 * that already completed.
 */
export async function recordRunOutcome(
  supabase: SupabaseClient,
  portalName: string | null,
  outcome: {
    success: boolean
    error?: string | null
    /**
     * Whether this failure is evidence the PORTAL is broken.
     *
     * Set from the run's diagnosis. A closed posting, a missing résumé URL or
     * an SSO wall says nothing about Greenhouse's health — but three of them in
     * a row used to trip the breaker open for every candidate applying through
     * Greenhouse. Only a portal-fault failure moves the breaker; everything
     * else is recorded and ignored here.
     *
     * Defaults to true so callers that don't yet pass a diagnosis keep the old,
     * more conservative behaviour.
     */
    portalFault?: boolean
  }
): Promise<void> {
  if (!portalName) return
  // A failure that isn't the portal's fault must not count against it. A
  // success always does — it is what closes a half-open breaker.
  if (!outcome.success && outcome.portalFault === false) return
  try {
    const current = await readBreaker(supabase, portalName)
    const next = transition(current, outcome)
    // Only write when something actually changed, to keep this off the hot path
    // for the common case of a healthy portal succeeding again.
    if (
      next.state !== current.state ||
      next.consecutiveFailures !== current.consecutiveFailures ||
      next.lastError !== current.lastError
    ) {
      await writeBreaker(supabase, next)
    }
  } catch (err) {
    console.warn("[preflight] breaker update failed (non-fatal):", err)
  }
}

// ─── The gate ───

/**
 * Evaluate an application before dispatch.
 *
 * Never throws: a failure inside the gate itself resolves to `allow: true`, on
 * the principle that a broken screener must not silently stop the whole queue.
 */
export async function preflight(
  supabase: SupabaseClient,
  app: KnockoutCandidate & CoverageProfile & { job_url?: string | null; job_id?: string | null },
  job: KnockoutJob | null
): Promise<PreflightResult> {
  const detection = app.job_url ? detectPortalScored(app.job_url) : null
  const portalName = detection?.portal.name ?? null
  const portalConfidence = detection?.confidence ?? 0

  const knockoutReport = job
    ? evaluateKnockouts(app, job)
    : { checks: [] as Knockout[], failures: [], warnings: [], blocked: false, blockReason: null }
  const coverage = estimateCoverage(app, portalName)

  const base = {
    portalName,
    portalConfidence,
    knockouts: knockoutReport.checks,
    knockoutBlocked: knockoutReport.blocked,
    coverage,
  }

  // 1. Unrecognized or low-confidence portal. We have no handler and no
  //    confident apply-URL rewrite, so a run here is a near-certain waste.
  if (!detection) {
    return {
      ...base,
      allow: false,
      blockKind: "portal",
      reason: "Unrecognized ATS portal — no handler for this URL. Needs manual review.",
      retryable: false,
    }
  }
  if (portalConfidence < CONFIDENT_THRESHOLD) {
    return {
      ...base,
      allow: false,
      blockKind: "portal",
      reason: `Low-confidence portal match (${portalName}, ${portalConfidence}%: ${detection.signals.join(", ")}). Needs manual review.`,
      retryable: false,
    }
  }

  // 2. Explicit disqualifiers.
  if (knockoutReport.blocked) {
    return {
      ...base,
      allow: false,
      blockKind: "knockout",
      reason: knockoutReport.blockReason,
      retryable: false,
    }
  }

  // 3. A missing blocking field stalls the submit gate every time — the run
  //    would spend a full session and then refuse to submit.
  if (!coverage.canReachSubmit) {
    return {
      ...base,
      allow: false,
      blockKind: "coverage",
      reason: `Profile is missing required field(s): ${coverage.blockingMissing.join(", ")}. The run would stall before Submit.`,
      // Fixable — once the profile is completed this should be re-queued.
      retryable: true,
    }
  }

  // 4. Portal-level circuit breaker.
  try {
    // Read off `detection` rather than `portalName`: the early returns above
    // guarantee it's set here, but only this expression proves it to the compiler.
    const current = await readBreaker(supabase, detection.portal.name)
    const d = decide(current, DEFAULT_BREAKER_CONFIG)
    if (d.record.state !== current.state) {
      // Persist the open → halfOpen move so exactly one probe gets through.
      await writeBreaker(supabase, d.record)
    }
    if (!d.allow) {
      const mins = d.retryInMs ? Math.max(1, Math.ceil(d.retryInMs / 60_000)) : null
      return {
        ...base,
        allow: false,
        blockKind: "breaker",
        reason: `${d.reason}${mins ? ` Retrying in ~${mins}m.` : ""}`,
        retryable: true,
      }
    }
  } catch (err) {
    // A breaker we can't read must not stop the queue.
    console.warn("[preflight] breaker read failed, allowing dispatch:", err)
  }

  return { ...base, allow: true, blockKind: null, reason: null, retryable: false }
}

/** Persist a pre-flight verdict onto the queue row for the UI to render. */
export async function persistPreflight(
  supabase: SupabaseClient,
  applicationId: string,
  r: PreflightResult
): Promise<void> {
  try {
    await supabase
      .from("live_application_queue")
      .update({
        knockout_blocked: r.knockoutBlocked,
        knockout_reason: r.blockKind === "knockout" ? r.reason : null,
        knockout_checks: r.knockouts,
        coverage_percent: r.coverage.percent,
        coverage_blocking_missing: r.coverage.blockingMissing.length ? r.coverage.blockingMissing : null,
        portal_confidence: r.portalConfidence,
        portal_name: r.portalName,
        screened_at: new Date().toISOString(),
      })
      .eq("id", applicationId)
  } catch (err) {
    console.warn("[preflight] verdict persist failed (non-fatal):", err)
  }
}

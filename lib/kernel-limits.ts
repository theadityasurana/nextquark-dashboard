/**
 * How many browsers we are actually allowed to run at once.
 *
 * `PROFILE_POOL_SIZE` was a hardcoded 4 with no relationship to the Kernel plan
 * behind the API key. That number is wrong in both directions and neither
 * failure is visible: too high and every run past the limit is rejected by the
 * API mid-dispatch, too low and the queue crawls while paid-for capacity sits
 * idle.
 *
 * Kernel publishes the real number. {@link fetchConcurrencyLimit} reads it once
 * per process and caches it, and {@link effectiveConcurrency} applies the
 * safety margin — because the org limit covers *every* browser on the account,
 * including anything running outside this app.
 *
 * The pure part ({@link effectiveConcurrency}) is separated from the IO so the
 * clamping rules are unit-testable without an API key.
 */

import type Kernel from "@onkernel/sdk"

/**
 * Never dispatch more than this regardless of plan.
 *
 * A candidate applying from twelve browsers at once is itself a bot signal, and
 * the ATSes we target rate-limit per-account. The cap is about looking human,
 * not about capacity.
 */
export const MAX_REASONABLE_CONCURRENCY = 5

/**
 * Fraction of the org limit this app may claim.
 *
 * The limit is shared across everything on the Kernel account — other projects,
 * manual sessions, anything else running. Claiming all of it means the first
 * unrelated session pushes us over and our next create fails.
 */
const CLAIM_FRACTION = 0.75

export interface ConcurrencyDecision {
  /** What we will actually run in parallel. */
  limit: number
  /** The org-wide ceiling we read, or null when it could not be read. */
  orgLimit: number | null
  /** Operator-facing explanation, logged once at startup. */
  reason: string
}

/**
 * Turn a raw org limit into the number we dispatch with.
 *
 * Pure. `orgLimit` is null when the API could not be reached, in which case we
 * fall back to a deliberately timid 2 — being slow is recoverable, and being
 * rejected mid-run is not.
 */
export function effectiveConcurrency(
  orgLimit: number | null,
  override?: number | null
): ConcurrencyDecision {
  // An explicit operator override wins, but is still capped: the cap exists for
  // anti-bot reasons, not capacity ones, so it is not a number to opt out of.
  if (override && override > 0) {
    const limit = Math.min(override, MAX_REASONABLE_CONCURRENCY)
    return {
      limit,
      orgLimit,
      reason:
        limit < override
          ? `Override of ${override} capped to ${limit} — running more than that from one account reads as automated.`
          : `Using the configured override of ${limit}.`,
    }
  }

  if (orgLimit == null) {
    return {
      limit: 2,
      orgLimit: null,
      reason: "Could not read the Kernel concurrency limit — defaulting to 2 to avoid rejected sessions.",
    }
  }

  if (orgLimit <= 1) {
    return {
      limit: 1,
      orgLimit,
      reason: `The Kernel plan allows ${orgLimit} concurrent browser — running one application at a time.`,
    }
  }

  const claimed = Math.max(1, Math.floor(orgLimit * CLAIM_FRACTION))
  const limit = Math.min(claimed, MAX_REASONABLE_CONCURRENCY)
  return {
    limit,
    orgLimit,
    reason:
      limit < claimed
        ? `Kernel plan allows ${orgLimit} concurrent browsers; capped at ${limit} so one candidate doesn't apply from more places at once than a person could.`
        : `Kernel plan allows ${orgLimit} concurrent browsers; claiming ${limit} and leaving headroom for anything else on the account.`,
  }
}

let cached: ConcurrencyDecision | null = null

/** Drop the cache — called when the API key changes. */
export function clearConcurrencyCache(): void {
  cached = null
}

/**
 * Read the account's concurrency limit, once per process.
 *
 * Never throws: an unreachable limits endpoint must not stop dispatch, it just
 * makes us conservative.
 */
export async function fetchConcurrencyLimit(
  kernel: InstanceType<typeof Kernel>,
  override?: number | null
): Promise<ConcurrencyDecision> {
  if (cached) return cached

  let orgLimit: number | null = null
  try {
    const limits = await (kernel as any).organization?.limits?.retrieve?.()
    const raw = limits?.max_concurrent_sessions
    if (typeof raw === "number" && raw > 0) orgLimit = raw
  } catch (err) {
    console.warn("[kernel-limits] could not read organization limits:", err instanceof Error ? err.message : err)
  }

  cached = effectiveConcurrency(orgLimit, override)
  return cached
}

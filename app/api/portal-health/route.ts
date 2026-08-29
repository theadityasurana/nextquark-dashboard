import { createClient } from "@/lib/supabase/server"
import { healthLabel, type BreakerRecord } from "@/lib/circuit-breaker"

export const dynamic = "force-dynamic"

/**
 * Per-portal breaker state for the Overview health strip.
 *
 * The label ("paused · retry in 7m") is computed here rather than in the client
 * so the countdown is against server time — a client clock that is off would
 * otherwise show a wrong retry estimate.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("portal_breakers")
      .select("*")
      .order("portal", { ascending: true })

    if (error) {
      // Most likely cause: migration 055 hasn't been applied yet, so
      // `portal_breakers` doesn't exist. Report it as an empty-but-unavailable
      // strip rather than a hard failure that breaks the whole queue screen.
      console.warn("[portal-health] read failed:", error.message)
      return Response.json({ portals: [], available: false, reason: error.message })
    }

    const portals = (data || []).map((row) => {
      const record: BreakerRecord = {
        portal: row.portal,
        state: row.state,
        consecutiveFailures: row.consecutive_failures ?? 0,
        openedAt: row.opened_at,
        lastFailureAt: row.last_failure_at,
        lastSuccessAt: row.last_success_at,
        lastError: row.last_error,
      }
      const { label, tone } = healthLabel(record)
      return {
        portal: record.portal,
        state: record.state,
        consecutiveFailures: record.consecutiveFailures,
        lastError: record.lastError,
        lastSuccessAt: record.lastSuccessAt,
        lastFailureAt: record.lastFailureAt,
        label,
        tone,
      }
    })

    return Response.json({ portals, available: true })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

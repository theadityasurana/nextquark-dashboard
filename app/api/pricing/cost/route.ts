import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { summarizeCost } from "@/lib/run-cost"

export const dynamic = "force-dynamic"

/**
 * What the automation has cost to run, as opposed to what it earns.
 *
 * The rest of /api/pricing reports subscription revenue. This is the other side
 * of that ledger: Kernel bills browser time by the second, so every completed
 * application has a real cost, and the two numbers only mean something together.
 *
 * Only rows with a measured duration are summed — see summarizeCost. A queued or
 * never-launched application consumed no browser time, and counting it would
 * understate what an application actually costs to run.
 */
export async function GET() {
  try {
    const supabase = createAdminClient()

    // Paged: the queue outgrows a single 1000-row response quickly, and a
    // truncated read would silently under-report the total.
    const rows: Array<{ processing_time_ms: number | null; started_at: string | null; completed_at: string | null; status: string | null }> = []
    for (let from = 0; from < 50000; from += 1000) {
      const { data, error } = await supabase
        .from("live_application_queue")
        .select("processing_time_ms, started_at, completed_at, status")
        .range(from, from + 999)
      if (error) throw error
      if (!data?.length) break
      rows.push(...data)
      if (data.length < 1000) break
    }

    const all = summarizeCost(rows)
    const completed = summarizeCost(
      rows.filter((r) => ["completed", "done", "applied", "submitted"].includes(String(r.status || "").toLowerCase()))
    )

    return NextResponse.json({
      totalCost: all.totalCost,
      billedRuns: all.billedRuns,
      totalSeconds: all.totalSeconds,
      costPerApplication: all.costPerApplication,
      averageSeconds: all.averageSeconds,
      // Separated because a failed run still burns browser time: the gap between
      // these two is the cost of everything that did not result in an application.
      completedCost: completed.totalCost,
      completedRuns: completed.billedRuns,
      costPerCompleted: completed.costPerApplication,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compute run costs" },
      { status: 500 }
    )
  }
}

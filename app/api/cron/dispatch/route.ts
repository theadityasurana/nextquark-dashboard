import { randomUUID } from "node:crypto"
import { after, NextRequest, NextResponse } from "next/server"
import { LEASE_SECONDS, runClaimedApplication } from "@/lib/application-runner"
import { reconcileSubmissionsFromEmail } from "@/lib/submission-email"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Server-side automatic dispatch, so applications start whether or not any
 * laptop is running `npm run worker`.
 *
 * Supabase pg_cron calls this every minute (job `dispatch-applications`).
 * claim_applications reads Auto Start, Premium Only and Concurrency from the
 * dashboard settings and counts live leases across every dispatcher, so this
 * route and a local worker can run side by side without exceeding the limit.
 *
 * The response returns immediately; the runs continue in after() until they
 * finish or the function hits maxDuration. A run cut off there stops renewing
 * its lease, and reclaim_expired_leases puts the row back for a later tick.
 */
// The Vercel plan caps functions at 300s (a deploy with 800 was rejected).
export const maxDuration = 300
export const dynamic = "force-dynamic"

const SESSION_STAGGER_MS = 2_000

export async function GET(request: NextRequest) {
  return handler(request)
}
export async function POST(request: NextRequest) {
  return handler(request)
}

async function handler(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const workerId = `vercel-${randomUUID()}`

  const { data: reclaimed, error: reclaimError } = await supabase.rpc("reclaim_expired_leases")
  if (reclaimError) console.error(`[dispatch] reclaim failed: ${reclaimError.message}`)

  const { data, error } = await supabase.rpc("claim_applications", {
    p_worker: workerId,
    p_lease_seconds: LEASE_SECONDS,
  })
  if (error) {
    console.error(`[dispatch] claim failed: ${error.message}`)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const ids = ((data ?? []) as Array<{ id: string }>).map((row) => row.id)

  await supabase
    .from("worker_heartbeats")
    .upsert({ worker_id: "vercel-cron", last_seen: new Date().toISOString(), active: ids.length })

  after(async () => {
    await Promise.allSettled(
      ids.map(async (id, i) => {
        // Staggered, so a full batch does not hit Kernel's session API at once.
        await new Promise((r) => setTimeout(r, i * SESSION_STAGGER_MS))
        const startedAt = Date.now()
        try {
          const summary = await runClaimedApplication(id, workerId)
          console.log(`[dispatch] END ${id} ${summary.outcome} in ${Math.round((Date.now() - startedAt) / 1000)}s`)
        } catch (err) {
          console.error(`[dispatch] CRASH ${id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      })
    )
    try {
      for (const proof of await reconcileSubmissionsFromEmail(supabase)) console.log(`[dispatch] CONFIRMED BY EMAIL ${proof}`)
    } catch (err) {
      console.error(`[dispatch] email reconcile failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  return NextResponse.json({ claimed: ids.length, ids, reclaimed: reclaimed ?? 0 })
}

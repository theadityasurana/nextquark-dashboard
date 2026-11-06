import { randomUUID } from "node:crypto"
import { LEASE_SECONDS, runClaimedApplication, type RunSummary } from "@/lib/application-runner"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Manual Start for one application. Automatic dispatch belongs to the worker
 * (scripts/application-worker.ts), not to this route.
 *
 * A run longer than this limit is cut off, its lease expires, and the worker
 * picks the row back up, so nothing is stranded in `processing`.
 */
export const maxDuration = 300

const STREAM_STATUS: Record<RunSummary["outcome"], string> = {
  completed: "completed",
  retrying: "retrying",
  failed: "error",
  blocked: "blocked",
  awaiting_captcha: "awaiting_captcha",
  awaiting_otp: "awaiting_otp",
  deleted: "deleted",
  dry_run: "dry_run",
  missing: "error",
}

export async function POST(request: Request) {
  try {
    const { applicationId, stream } = await request.json()
    if (!applicationId) return Response.json({ error: "Missing applicationId" }, { status: 400 })

    const workerId = `manual-${randomUUID()}`
    const { data: claimed, error } = await createAdminClient().rpc("claim_application", {
      p_id: applicationId,
      p_worker: workerId,
      p_lease_seconds: LEASE_SECONDS,
    })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    if (!claimed) {
      return Response.json(
        { error: "Not started: it is already running, or every concurrency slot is in use." },
        { status: 409 }
      )
    }

    if (!stream) {
      const summary = await runClaimedApplication(applicationId, workerId)
      return Response.json(summary)
    }

    const encoder = new TextEncoder()
    return new Response(
      new ReadableStream({
        async start(controller) {
          let closed = false
          const send = (data: unknown) => {
            if (closed) return
            try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch { closed = true }
          }
          const summary = await runClaimedApplication(applicationId, workerId, send)
          send({ ...summary, status: STREAM_STATUS[summary.outcome], success: summary.outcome === "completed" })
          if (!closed) {
            closed = true
            try { controller.close() } catch {}
          }
        },
      }),
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } }
    )
  } catch (error) {
    console.error("Auto-apply queue error:", error)
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 })
  }
}

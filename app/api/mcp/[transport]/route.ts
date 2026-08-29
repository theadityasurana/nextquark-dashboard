import { createMcpHandler } from "mcp-handler"
// zod v4, aliased. The MCP server requires a Standard Schema with JSON Schema
// output (`~standard.jsonSchema`), which only zod v4 provides — but the rest of
// this app is pinned to zod v3 by the `overrides` block in package.json because
// Stagehand needs it. Aliasing keeps v4 scoped to this one route rather than
// upgrading the dependency the entire automation stack runs on.
import { z } from "zod4"
import { createClient } from "@supabase/supabase-js"
import { evaluateKnockouts } from "@/lib/knockouts"
import { estimateCoverage } from "@/lib/fill-coverage"
import { detectPortalScored } from "@/lib/portal-detector"
import { summarize } from "@/lib/run-timeline"
import { healthLabel, type BreakerRecord } from "@/lib/circuit-breaker"

/**
 * MCP server — exposes the operator dashboard as agent tools.
 *
 * This is the read/triage surface, not a control plane: an agent can inspect the
 * queue, screen an application, and read run outcomes, but it cannot dispatch
 * runs, submit applications, or mutate candidate data. Applications are sent on
 * real people's behalf; that stays behind the dashboard where a human does it
 * deliberately.
 *
 * Auth: set MCP_TOKEN to require `Authorization: Bearer <token>`. Left unset,
 * the route is open — fine for local use, NOT for a deployed instance, since
 * these tools read candidate PII.
 *
 * Connect with:
 *   claude mcp add --transport http nextquark https://<host>/api/mcp/mcp
 */

export const maxDuration = 60

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Wrap any JSON-serializable value as MCP text content. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] }
}

/**
 * Candidate-facing fields are summarized rather than dumped: an agent triaging
 * the queue needs to identify a row, not receive someone's full profile.
 */
function queueSummary(a: Record<string, any>) {
  return {
    id: a.id,
    candidate: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(),
    company: a.company_name,
    role: a.job_title,
    status: a.status,
    portal: a.portal_name,
    attempts: a.attempt_count,
    createdAt: a.created_at,
    confirmationId: a.confirmation_id ?? null,
    failedStep: a.failed_step ?? null,
    knockoutBlocked: a.knockout_blocked ?? null,
    coveragePercent: a.coverage_percent ?? null,
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "list_queue",
      {
        title: "List the application queue",
        description:
          "List applications in the live queue, newest first. Filter by status to triage — e.g. 'failed' for runs that broke, 'blocked' for ones the pre-flight gate refused.",
        inputSchema: z.object({
          status: z
            .enum([
              "pending", "processing", "completed", "failed",
              "awaiting_otp", "awaiting_captcha", "blocked",
            ])
            .optional()
            .describe("Filter by status. Omit for all."),
          limit: z.number().int().min(1).max(100).default(25),
        }),
      },
      async ({ status, limit }) => {
        const supabase = db()
        let q = supabase
          .from("live_application_queue")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit)
        if (status) q = q.eq("status", status)
        const { data, error } = await q
        if (error) return json({ error: error.message })
        return json({ count: data?.length ?? 0, applications: (data ?? []).map(queueSummary) })
      }
    )

    server.registerTool(
      "get_run",
      {
        title: "Get a run's timeline",
        description:
          "The full step-by-step timeline for one application: which step failed, how long each took, the form's own validation errors, and the confirmation ID if it submitted.",
        inputSchema: z.object({ applicationId: z.string().describe("Application id from list_queue") }),
      },
      async ({ applicationId }) => {
        const supabase = db()
        const { data, error } = await supabase
          .from("live_application_queue")
          .select("*")
          .eq("id", applicationId)
          .maybeSingle()
        if (error) return json({ error: error.message })
        if (!data) return json({ error: "Application not found" })

        const timeline = data.run_timeline ?? null
        return json({
          ...queueSummary(data),
          confirmationLabel: data.confirmation_label ?? null,
          confirmationConfidence: data.confirmation_confidence ?? null,
          validationErrors: data.validation_errors ?? [],
          summary: timeline ? summarize(timeline) : null,
          steps: timeline?.steps ?? null,
        })
      }
    )

    server.registerTool(
      "screen_application",
      {
        title: "Screen an application",
        description:
          "Run the pre-flight checks for one application without dispatching it: knockouts (work authorization, experience, location), form-fill coverage, and portal detection confidence. Read-only — nothing is queued or submitted.",
        inputSchema: z.object({ applicationId: z.string() }),
      },
      async ({ applicationId }) => {
        const supabase = db()
        const { data: app } = await supabase
          .from("live_application_queue")
          .select("*")
          .eq("id", applicationId)
          .maybeSingle()
        if (!app) return json({ error: "Application not found" })

        const { data: job } = app.job_id
          ? await supabase
              .from("jobs")
              .select("work_authorization, experience, location, type, description, detailed_requirements")
              .eq("id", app.job_id)
              .maybeSingle()
          : { data: null }

        const detection = app.job_url ? detectPortalScored(app.job_url) : null
        const knockouts = job ? evaluateKnockouts(app, job) : null
        const coverage = estimateCoverage(app, detection?.portal.name ?? null)

        return json({
          applicationId,
          portal: detection
            ? { name: detection.portal.name, confidence: detection.confidence, signals: detection.signals }
            : null,
          knockouts: knockouts
            ? { blocked: knockouts.blocked, reason: knockouts.blockReason, checks: knockouts.checks }
            : { note: "No linked job record to screen against." },
          coverage: {
            percent: coverage.percent,
            canReachSubmit: coverage.canReachSubmit,
            blockingMissing: coverage.blockingMissing,
            missing: coverage.missing,
          },
        })
      }
    )

    server.registerTool(
      "portal_health",
      {
        title: "Portal circuit-breaker status",
        description:
          "Current breaker state per ATS portal. A portal in 'open' state is not being dispatched to because it failed repeatedly.",
        inputSchema: z.object({}),
      },
      async () => {
        const supabase = db()
        const { data, error } = await supabase.from("portal_breakers").select("*").order("portal")
        if (error) return json({ error: error.message, note: "Has migration 055 been applied?" })
        return json({
          portals: (data ?? []).map((row) => {
            const record: BreakerRecord = {
              portal: row.portal,
              state: row.state,
              consecutiveFailures: row.consecutive_failures ?? 0,
              openedAt: row.opened_at,
              lastFailureAt: row.last_failure_at,
              lastSuccessAt: row.last_success_at,
              lastError: row.last_error,
            }
            return { ...record, ...healthLabel(record) }
          }),
        })
      }
    )

    server.registerTool(
      "queue_stats",
      {
        title: "Queue statistics",
        description:
          "Counts by status plus failure breakdown by step — the fastest way to see what's wrong across the whole queue rather than one application at a time.",
        inputSchema: z.object({}),
      },
      async () => {
        const supabase = db()
        const { data, error } = await supabase
          .from("live_application_queue")
          .select("status, failed_step, portal_name, confirmation_id")
        if (error) return json({ error: error.message })

        const byStatus: Record<string, number> = {}
        const byFailedStep: Record<string, number> = {}
        const byPortal: Record<string, number> = {}
        let withReceipt = 0

        for (const r of data ?? []) {
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
          if (r.failed_step) byFailedStep[r.failed_step] = (byFailedStep[r.failed_step] ?? 0) + 1
          if (r.portal_name) byPortal[r.portal_name] = (byPortal[r.portal_name] ?? 0) + 1
          if (r.confirmation_id) withReceipt++
        }

        return json({
          total: data?.length ?? 0,
          byStatus,
          byFailedStep,
          byPortal,
          submissionsWithConfirmationId: withReceipt,
        })
      }
    )

    server.registerTool(
      "list_answer_bank",
      {
        title: "List a candidate's answer bank",
        description:
          "The stored application answers for one candidate, with how often each has been reused. Sensitive answers (citizenship, criminal history, clearance, health, salary history) are listed but their values are redacted.",
        inputSchema: z.object({ userId: z.string() }),
      },
      async ({ userId }) => {
        const supabase = db()
        const { data, error } = await supabase
          .from("application_answers")
          .select("question, answer, intent, source, is_sensitive, times_used, last_used_at")
          .eq("user_id", userId)
          .order("times_used", { ascending: false })
        if (error) return json({ error: error.message, note: "Has migration 056 been applied?" })
        return json({
          count: data?.length ?? 0,
          answers: (data ?? []).map((a) => ({
            ...a,
            // Sensitive values are never returned over MCP — an agent has no
            // need for someone's criminal-history or citizenship answer.
            answer: a.is_sensitive ? "[redacted — sensitive]" : a.answer,
          })),
        })
      }
    )
  },
  { serverInfo: { name: "nextquark", version: "1.0.0" } }
)

/**
 * Bearer-token gate. Applied to every method: these tools read candidate PII, so
 * an unauthenticated deployed instance would be a data leak.
 */
async function guarded(request: Request) {
  const required = process.env.MCP_TOKEN
  if (required) {
    const auth = request.headers.get("authorization") ?? ""
    const token = auth.replace(/^Bearer\s+/i, "")
    if (token !== required) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
  }
  return handler(request)
}

export { guarded as GET, guarded as POST, guarded as DELETE }

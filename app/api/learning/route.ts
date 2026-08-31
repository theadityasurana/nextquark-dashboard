import { createClient } from "@/lib/supabase/server"
import { skillDomain } from "@/lib/domain-skills"

export const dynamic = "force-dynamic"

/**
 * Everything the system has taught itself, plus the run evidence behind it.
 *
 * Three sources, deliberately kept separate rather than blended into one score:
 *
 *   · domain_skills       — what we learned about SITES. Versioned and scored,
 *                           so the history shows what we used to believe.
 *   · application_answers — what we learned about the CANDIDATE, and how often
 *                           each answer has saved a model call since.
 *   · live_application_queue — the outcomes those lessons were derived from.
 *
 * Nothing here is authored. Every row is written by a real run, which is the
 * point: a "learning" page that carries hand-written prose is a changelog
 * wearing a disguise.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const [skillsRes, answersRes, runsRes] = await Promise.all([
      supabase
        .from("domain_skills")
        .select("id, domain, content, version, score, status, times_used, created_at, updated_at")
        .order("domain", { ascending: true })
        .order("version", { ascending: false }),
      supabase
        .from("application_answers")
        .select("question, answer, state, scope_kind, times_used, is_sensitive, updated_at")
        .order("times_used", { ascending: false })
        .limit(500),
      supabase
        .from("live_application_queue")
        .select("company_name, job_url, status, processing_time_ms, error_message, confirmation_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ])

    // A missing table is a setup problem, not a crash. Report it per-section so
    // the page can say WHICH migration has not been applied instead of showing
    // an empty state that looks like "nothing learned yet".
    const unavailable: Record<string, string> = {}
    if (skillsRes.error) unavailable.skills = skillsRes.error.message
    if (answersRes.error) unavailable.answers = answersRes.error.message
    if (runsRes.error) unavailable.runs = runsRes.error.message

    const skills = skillsRes.data ?? []
    const answers = answersRes.data ?? []
    const runs = runsRes.data ?? []

    // ─── Site knowledge, grouped so supersession is visible ───
    //
    // A domain's rows are its belief history. Showing them flat hides the one
    // thing worth seeing: that v1 was retired and v2 replaced it.
    const byDomain = new Map<string, typeof skills>()
    for (const s of skills) {
      const list = byDomain.get(s.domain) ?? []
      list.push(s)
      byDomain.set(s.domain, list)
    }
    const domains = [...byDomain.entries()]
      .map(([domain, versions]) => ({
        domain,
        versions,
        active: versions.filter((v) => v.status === "active").length,
        retired: versions.filter((v) => v.status === "retired").length,
        bestScore: versions.reduce((m, v) => Math.max(m, v.score ?? 0), -Infinity),
        totalUses: versions.reduce((n, v) => n + (v.times_used ?? 0), 0),
      }))
      .sort((a, b) => b.totalUses - a.totalUses)

    // ─── Answer bank ───
    const answerStats = {
      total: answers.length,
      byState: answers.reduce<Record<string, number>>((acc, a) => {
        const k = a.state || "unknown"
        acc[k] = (acc[k] ?? 0) + 1
        return acc
      }, {}),
      // Reuse is the whole value of the bank: an answer used five times is four
      // model calls that never happened.
      reusedTotal: answers.reduce((n, a) => n + Math.max(0, (a.times_used ?? 0) - 1), 0),
      topReused: answers
        .filter((a) => (a.times_used ?? 0) > 0)
        .slice(0, 12)
        .map((a) => ({
          question: a.question,
          answer: a.is_sensitive ? "•••••" : a.answer,
          timesUsed: a.times_used ?? 0,
          state: a.state,
          scope: a.scope_kind,
          isSensitive: !!a.is_sensitive,
        })),
    }

    // ─── Outcome evidence, per site ───
    //
    // `status` is not trustworthy on its own: the queue marks a run "completed"
    // even when the portal refused it, with the reason in error_message. A
    // submission is only real when nothing came back as an error.
    const submitted = (r: { error_message: string | null }) => !r.error_message

    // ─── A row that never ran is not a success ───
    //
    // Queue rows are created before the run starts, so a row that was never
    // picked up has no error AND no duration. Counting "no error" as submitted
    // scored those as wins: stripe.com read 3/3 (100%) with no recorded time at
    // all. A run has evidence of having happened when it recorded a duration or
    // a failure; anything else is not an attempt yet.
    const executed = runs.filter((r) => r.processing_time_ms != null || r.error_message != null)

    const outcomeMap = new Map<string, { domain: string; attempts: number; submitted: number; totalMs: number; timed: number; reasons: Map<string, number> }>()
    for (const r of executed) {
      const domain = r.job_url ? skillDomain(r.job_url) || "unknown" : "unknown"
      const e = outcomeMap.get(domain) ?? { domain, attempts: 0, submitted: 0, totalMs: 0, timed: 0, reasons: new Map() }
      e.attempts++
      if (submitted(r)) e.submitted++
      if (r.processing_time_ms) { e.totalMs += r.processing_time_ms; e.timed++ }
      if (r.error_message) {
        // Collapse to the leading clause: the tail carries per-field detail that
        // would make every failure look unique.
        const reason = String(r.error_message).split(/[:|]/)[0].trim().slice(0, 80)
        e.reasons.set(reason, (e.reasons.get(reason) ?? 0) + 1)
      }
      outcomeMap.set(domain, e)
    }
    const outcomes = [...outcomeMap.values()]
      .map((e) => ({
        domain: e.domain,
        attempts: e.attempts,
        submitted: e.submitted,
        successRate: e.attempts ? Math.round((e.submitted / e.attempts) * 100) : 0,
        avgSeconds: e.timed ? Math.round(e.totalMs / e.timed / 1000) : null,
        topReason: [...e.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      }))
      .sort((a, b) => b.attempts - a.attempts)

    const recentRuns = executed.slice(0, 25).map((r) => ({
      company: r.company_name,
      domain: r.job_url ? skillDomain(r.job_url) : null,
      submitted: submitted(r),
      seconds: r.processing_time_ms ? Math.round(r.processing_time_ms / 1000) : null,
      reason: r.error_message ? String(r.error_message).split(/[:|]/)[0].trim().slice(0, 90) : null,
      confirmationId: r.confirmation_id,
      at: r.created_at,
    }))

    return Response.json({
      domains,
      answerStats,
      outcomes,
      recentRuns,
      unavailable: Object.keys(unavailable).length ? unavailable : null,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

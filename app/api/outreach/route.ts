import { NextResponse } from "next/server"
import { draftMessages } from "@/lib/outreach"
import { loadLlmKeys, loadOutreachRows, toProfile } from "@/lib/outreach-data"
import { createAdminClient } from "@/lib/supabase/admin"
import { cachedValue, invalidateCached, forEachCached } from "@/lib/server-cache"
import type { OutreachRow } from "@/lib/outreach-data"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const clampDays = (v: unknown) => Math.min(99999, Math.max(1, Number(v) || 7))

/** The window's rows, shared for a minute (building them reads every auth user plus four tables). */
const rowsFor = (days: number) => cachedValue(`outreach:${days}`, 60_000, () => loadOutreachRows(createAdminClient(), days))

/**
 * GET /api/outreach?days=7&filter=todo|done|all|returning&q=&page=1&limit=20
 *   → { days, rows (one page), total, stats }
 */
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams
    const days = clampDays(sp.get("days"))
    const filter = sp.get("filter") || "todo"
    const q = (sp.get("q") || "").trim().toLowerCase()
    const page = Math.max(1, Number(sp.get("page")) || 1)
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 20))
    const all = await rowsFor(days)

    const isReturning = (r: (typeof all)[number]) => r.returnedAfterDays >= 1
    let rows = all.filter((r) =>
      filter === "all" ? true
        : filter === "done" ? r.contacted
        : filter === "returning" ? isReturning(r)
        : !r.contacted)
    if (filter === "returning") rows = [...rows].sort((a, b) => b.engagement - a.engagement)
    if (q) {
      const qd = q.replace(/\s/g, "")
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q) || (r.phone?.display ?? "").replace(/\s/g, "").includes(qd))
    }

    const stats = {
      total: all.length,
      done: all.filter((r) => r.contacted).length,
      withPhone: all.filter((r) => r.phone).length,
      withLinkedin: all.filter((r) => r.linkedinUrl).length,
      applied: all.filter((r) => r.jobsApplied > 0).length,
      missing: all.filter((r) => !r.message).length,
      returning: all.filter(isReturning).length,
      returningUncontacted: all.filter((r) => isReturning(r) && !r.contacted).length,
    }
    return NextResponse.json({ days, rows: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit, stats })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load outreach" }, { status: 500 })
  }
}

/**
 * Draft messages. Body: { days, userIds?, regenerate? }.
 * Without userIds, drafts every user in the window that has no message yet.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const supabase = createAdminClient()
    const rows = await loadOutreachRows(supabase, clampDays(body.days))
    const wanted: Set<string> | null = Array.isArray(body.userIds) ? new Set(body.userIds) : null
    const targets = rows.filter((r) => (wanted ? wanted.has(r.userId) : true) && (body.regenerate || wanted || !r.message))
    if (!targets.length) return NextResponse.json({ drafted: 0 })

    const drafts = await draftMessages(targets.map((r) => toProfile(r)), await loadLlmKeys(supabase))
    const now = new Date().toISOString()
    const { error } = await supabase.from("outreach_contacts").upsert(
      drafts.map((d) => ({ user_id: d.userId, message: d.message, model: d.model, generated_at: now, updated_at: now })),
      { onConflict: "user_id" }
    )
    if (error) throw new Error(error.message)
    invalidateCached("outreach:")
    return NextResponse.json({ drafted: drafts.length, models: [...new Set(drafts.map((d) => d.model))] })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to draft messages" }, { status: 500 })
  }
}

/** Body: { userId, contacted?, message? } */
export async function PATCH(request: Request) {
  try {
    const { userId, contacted, message } = await request.json()
    if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    const now = new Date().toISOString()
    const fields: Record<string, unknown> = { user_id: userId, updated_at: now }
    if (typeof contacted === "boolean") {
      fields.contacted = contacted
      fields.contacted_at = contacted ? now : null
    }
    if (typeof message === "string") fields.message = message.trim()
    const { error } = await createAdminClient().from("outreach_contacts").upsert(fields, { onConflict: "user_id" })
    if (error) throw new Error(error.message)
    // Patch cached windows in place instead of rebuilding them on every click.
    forEachCached<OutreachRow[]>("outreach:", (rows) => {
      const row = rows.find((r) => r.userId === userId)
      if (!row) return
      if (typeof contacted === "boolean") { row.contacted = contacted; row.contactedAt = contacted ? now : null }
      if (typeof message === "string") row.message = message.trim()
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to update" }, { status: 500 })
  }
}

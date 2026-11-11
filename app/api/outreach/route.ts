import { NextResponse } from "next/server"
import { draftMessages } from "@/lib/outreach"
import { loadLlmKeys, loadOutreachRows, toProfile } from "@/lib/outreach-data"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const clampDays = (v: unknown) => Math.min(99999, Math.max(1, Number(v) || 7))

export async function GET(request: Request) {
  try {
    const days = clampDays(new URL(request.url).searchParams.get("days"))
    const rows = await loadOutreachRows(createAdminClient(), days)
    return NextResponse.json({ days, rows })
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
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to update" }, { status: 500 })
  }
}

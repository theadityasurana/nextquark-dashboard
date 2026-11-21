import { cachedRoute } from "@/lib/server-cache"
import { createAdminClient } from "@/lib/supabase/admin"

/** A user counts as "active now" if they did something in the app within this window. */
const ACTIVE_MS = 5 * 60_000
/** The pop-up also lists people seen recently, so a quiet minute doesn't empty it. */
const RECENT_MS = 30 * 60_000
/** A profile write this close to a worker event on the same user came from the worker, not the user. */
const WORKER_ECHO_MS = 10_000

type QueueRow = { user_id: string; created_at: string; started_at: string | null; completed_at: string | null; job_title: string | null; company_name: string | null }

/**
 * Who is using the app right now.
 *
 * Two signals, both written when a user acts:
 *  - a right swipe inserts a live_application_queue row (created_at)
 *  - any swipe or profile edit writes profiles.updated_at
 * A DB trigger also bumps profiles.updated_at when the worker starts or
 * finishes one of the user's applications, so profile writes that line up
 * with a worker event are ignored.
 */
async function load() {
  const supabase = createAdminClient()
  const now = Date.now()
  const since = new Date(now - RECENT_MS).toISOString()

  const [profilesRes, swipesRes, workerRes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, first_name, last_name, updated_at, daily_swipes_remaining, subscription_type").gte("updated_at", since).limit(1000),
    supabase.from("live_application_queue").select("user_id, created_at, job_title, company_name").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
    supabase.from("live_application_queue").select("user_id, started_at, completed_at").or(`started_at.gte.${since},completed_at.gte.${since}`).limit(1000),
  ])
  for (const r of [profilesRes, swipesRes, workerRes]) if (r.error) throw new Error(r.error.message)

  const workerEvents = new Map<string, number[]>()
  for (const r of (workerRes.data ?? []) as Pick<QueueRow, "user_id" | "started_at" | "completed_at">[]) {
    const list = workerEvents.get(r.user_id) ?? []
    for (const t of [r.started_at, r.completed_at]) if (t) list.push(new Date(t).getTime())
    workerEvents.set(r.user_id, list)
  }

  type Entry = { lastSeen: number; swipes: number; lastJob: string | null }
  const users = new Map<string, Entry>()
  const touch = (id: string, t: number) => {
    const e = users.get(id) ?? { lastSeen: 0, swipes: 0, lastJob: null }
    e.lastSeen = Math.max(e.lastSeen, t)
    users.set(id, e)
    return e
  }

  for (const r of (swipesRes.data ?? []) as Pick<QueueRow, "user_id" | "created_at" | "job_title" | "company_name">[]) {
    if (!r.user_id) continue
    const e = touch(r.user_id, new Date(r.created_at).getTime())
    e.swipes++
    // Rows are newest first, so the first one seen is the latest swipe.
    if (!e.lastJob && (r.job_title || r.company_name)) e.lastJob = [r.job_title, r.company_name].filter(Boolean).join(" · ")
  }

  const profileById = new Map((profilesRes.data ?? []).map((p) => [p.id, p]))
  for (const p of profilesRes.data ?? []) {
    const t = new Date(p.updated_at).getTime()
    const echo = (workerEvents.get(p.id) ?? []).some((w) => Math.abs(w - t) <= WORKER_ECHO_MS)
    if (!echo) touch(p.id, t)
  }

  // Names for swipers whose profile wasn't in the updated_at window.
  const missing = [...users.keys()].filter((id) => !profileById.has(id))
  if (missing.length) {
    const { data, error } = await supabase.from("profiles").select("id, full_name, first_name, last_name, updated_at, daily_swipes_remaining, subscription_type").in("id", missing)
    if (error) throw new Error(error.message)
    for (const p of data ?? []) profileById.set(p.id, p)
  }

  const list = [...users.entries()]
    .map(([id, e]) => {
      const p = profileById.get(id)
      const name = (p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "").trim() || "Unknown user"
      return {
        id,
        name,
        plan: p?.subscription_type ?? null,
        lastSeen: new Date(e.lastSeen).toISOString(),
        activeNow: now - e.lastSeen <= ACTIVE_MS,
        rightSwipes: e.swipes,
        swipesLeft: p?.daily_swipes_remaining ?? null,
        lastJob: e.lastJob,
      }
    })
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))

  return Response.json({
    activeNow: list.filter((u) => u.activeNow).length,
    recent: list.length,
    activeWindowMinutes: ACTIVE_MS / 60_000,
    recentWindowMinutes: RECENT_MS / 60_000,
    users: list,
    generatedAt: new Date(now).toISOString(),
  })
}

export function GET(request: Request) {
  return cachedRoute(request, 15_000, async () => {
    try {
      return await load()
    } catch (err) {
      console.error("Active users fetch error:", err)
      return Response.json({ error: "Failed to fetch active users" }, { status: 500 })
    }
  })
}

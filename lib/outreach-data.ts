import type { SupabaseClient } from "@supabase/supabase-js"
import { formatPhone, whatsappLink, type FormattedPhone, type LlmKeys, type OutreachProfile } from "@/lib/outreach"

export interface OutreachRow {
  userId: string
  name: string
  firstName: string
  email: string | null
  signedUpAt: string
  lastActive: string | null
  phone: FormattedPhone | null
  rawPhone: string | null
  jobsApplied: number
  jobsSwiped: number
  companies: string[]
  headline: string | null
  roles: string[]
  location: string | null
  message: string | null
  model: string | null
  whatsappUrl: string | null
  contacted: boolean
  contactedAt: string | null
  isPremium: boolean
}

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []

function firstNameOf(full: string, email: string | null): string {
  const first = full.trim().split(/\s+/)[0]
  if (first) return first.charAt(0).toUpperCase() + first.slice(1)
  const local = (email || "").split("@")[0].replace(/[^a-zA-Z]/g, "")
  return local ? local.charAt(0).toUpperCase() + local.slice(1).toLowerCase() : "there"
}

async function inChunks<T>(ids: string[], fetchChunk: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 150) out.push(...(await fetchChunk(ids.slice(i, i + 150))))
  return out
}

/** Everyone who signed up in the last `days` days, with their activity and outreach state. */
export async function loadOutreachRows(supabase: SupabaseClient, days: number): Promise<OutreachRow[]> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const users: Array<{ id: string; email?: string; phone?: string; created_at: string; user_metadata?: Record<string, unknown> }> = []
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    users.push(...data.users.filter((u) => new Date(u.created_at).getTime() >= since))
    if (data.users.length < 1000) break
  }
  const ids = users.map((u) => u.id)
  if (!ids.length) return []

  const [profiles, queue, removed, outreach] = await Promise.all([
    inChunks(ids, async (chunk) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, first_name, last_name, phone, country_code, headline, desired_roles, experience_level, user_type, location, top_skills, swiped_job_ids, last_active, subscription_type")
        .in("id", chunk)
      if (error) throw new Error(`profiles: ${error.message}`)
      return data ?? []
    }),
    inChunks(ids, async (chunk) => {
      const { data, error } = await supabase.from("live_application_queue").select("user_id, company_name").in("user_id", chunk)
      if (error) throw new Error(`queue: ${error.message}`)
      return data ?? []
    }),
    inChunks(ids, async (chunk) => {
      const { data, error } = await supabase.from("removed_applications").select("company_name, row_data->>user_id").in("row_data->>user_id", chunk)
      if (error) throw new Error(`removed: ${error.message}`)
      return (data ?? []) as Array<{ company_name: string | null; user_id: string }>
    }),
    inChunks(ids, async (chunk) => {
      const { data, error } = await supabase.from("outreach_contacts").select("*").in("user_id", chunk)
      if (error) throw new Error(`outreach: ${error.message}`)
      return data ?? []
    }),
  ])

  const profileById = new Map(profiles.map((p: any) => [p.id, p]))
  const outreachById = new Map(outreach.map((o: any) => [o.user_id, o]))
  const applied = new Map<string, { count: number; companies: string[] }>()
  for (const row of [...queue, ...removed] as Array<{ user_id: string; company_name: string | null }>) {
    const entry = applied.get(row.user_id) ?? { count: 0, companies: [] }
    entry.count++
    if (row.company_name && !entry.companies.includes(row.company_name)) entry.companies.push(row.company_name)
    applied.set(row.user_id, entry)
  }

  const rows = users.map((u): OutreachRow => {
    const p: any = profileById.get(u.id) ?? {}
    const o: any = outreachById.get(u.id)
    const meta = u.user_metadata ?? {}
    const name = (p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || (meta.full_name as string) || (meta.name as string) || "").trim()
    const rawPhone = p.phone || u.phone || null
    const phone = formatPhone(rawPhone, p.country_code)
    const message = o?.message ?? null
    const activity = applied.get(u.id)
    return {
      userId: u.id,
      name: name || (u.email ?? "Unknown"),
      firstName: firstNameOf(name, u.email ?? null),
      email: u.email ?? null,
      signedUpAt: u.created_at,
      lastActive: p.last_active ?? null,
      phone,
      rawPhone,
      jobsApplied: activity?.count ?? 0,
      jobsSwiped: asArray(p.swiped_job_ids).length,
      companies: activity?.companies ?? [],
      headline: p.headline ?? null,
      roles: asArray(p.desired_roles),
      location: p.location ?? null,
      message,
      model: o?.model ?? null,
      whatsappUrl: whatsappLink(phone, message),
      contacted: !!o?.contacted,
      contactedAt: o?.contacted_at ?? null,
      isPremium: p.subscription_type === "premium",
    }
  })

  return rows.sort((a, b) => b.jobsApplied - a.jobsApplied || b.jobsSwiped - a.jobsSwiped || b.signedUpAt.localeCompare(a.signedUpAt))
}

export function toProfile(row: OutreachRow, extra: { experienceLevel?: string | null; userType?: string | null; topSkills?: string[] } = {}): OutreachProfile {
  return {
    userId: row.userId,
    firstName: row.firstName,
    headline: row.headline,
    desiredRoles: row.roles,
    location: row.location,
    jobsApplied: row.jobsApplied,
    jobsSwiped: row.jobsSwiped,
    companies: row.companies,
    ...extra,
  }
}

export async function loadLlmKeys(supabase: SupabaseClient): Promise<LlmKeys> {
  const { data } = await supabase.from("settings").select("geminiApiKey, groqApiKey, openRouterApiKey").eq("id", 1).maybeSingle()
  return {
    gemini: process.env.GEMINI_API_KEY || (data as any)?.geminiApiKey || undefined,
    groq: process.env.GROQ_API_KEY || (data as any)?.groqApiKey || undefined,
    openRouter: process.env.OPENROUTER_API_KEY || (data as any)?.openRouterApiKey || undefined,
  }
}

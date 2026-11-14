import { cachedRoute, cachedValue } from "@/lib/server-cache"
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// PostgREST caps responses at 1000 rows, so these page through.
async function collectIds(supabase: ReturnType<typeof createAdminClient>, table: string, column: string): Promise<Set<string>> {
  const ids = new Set<string>()
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(table).select(column).range(from, from + size - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
      const id = row[column]
      if (id) ids.add(id)
    }
    if (!data || data.length < size) break
  }
  return ids
}

type FunnelProfile = { id: string; is_onboarding_complete: boolean | null; heard_about_us: string | null }

async function collectProfiles(supabase: ReturnType<typeof createAdminClient>): Promise<Map<string, FunnelProfile>> {
  const profiles = new Map<string, FunnelProfile>()
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, is_onboarding_complete, heard_about_us')
      .order('id')
      .range(from, from + size - 1)
    if (error) throw new Error(`profiles: ${error.message}`)
    for (const row of (data ?? []) as FunnelProfile[]) profiles.set(row.id, row)
    if (!data || data.length < size) break
  }
  return profiles
}

type AuthUser = Awaited<ReturnType<ReturnType<typeof createAdminClient>['auth']['admin']['listUsers']>>['data']['users'][number]

/** Every auth user, paged from GoTrue and shared for 2 minutes across requests. */
function allAuthUsers(supabase: ReturnType<typeof createAdminClient>): Promise<AuthUser[]> {
  return cachedValue('auth-users', 2 * 60_000, async () => {
    const out: AuthUser[] = []
    for (let page = 1; page < 200; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) throw new Error(error.message)
      out.push(...data.users)
      if (data.users.length < 1000) break
    }
    return out
  })
}

const slim = (user: AuthUser) => ({
  id: user.id,
  email: user.email || 'No email',
  phone: user.phone || null,
  created_at: user.created_at,
  last_sign_in_at: user.last_sign_in_at ?? null,
  email_confirmed_at: user.email_confirmed_at ?? null,
  phone_confirmed_at: user.phone_confirmed_at ?? null,
  role: user.role,
  app_metadata: user.app_metadata,
  user_metadata: user.user_metadata,
  confirmed: !!user.email_confirmed_at,
  banned: !!(user as { banned_until?: string }).banned_until,
  provider: (user.app_metadata?.provider as string) || 'email',
})

/**
 * GET /api/users?page=1&perPage=25&q=   → { rows, total, stats }  (Users page)
 * GET /api/users?funnel=1               → per-user funnel flags   (Marketing page)
 *
 * The list is paged here rather than shipping every auth user (with metadata)
 * to the browser on each visit.
 */
export async function GET(request: Request) {
  const supabase = createAdminClient()
  const sp = new URL(request.url).searchParams

  if (sp.get('funnel') === '1') {
    return cachedRoute(request, 5 * 60_000, () => loadFunnel(supabase))
  }

  try {
    const users = await allAuthUsers(supabase)
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const perPage = Math.min(100, Math.max(1, Number(sp.get('perPage')) || 25))
    const q = (sp.get('q') || '').trim().toLowerCase()

    const sorted = [...users].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    const matched = q ? sorted.filter((u) => (u.email || '').toLowerCase().includes(q) || u.id.includes(q)) : sorted

    const now = Date.now()
    const DAY = 86_400_000
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    const age = (d?: string | null) => (d ? now - new Date(d).getTime() : Infinity)
    const providers: Record<string, number> = {}
    for (const u of users) {
      const p = (u.app_metadata?.provider as string) || 'email'
      providers[p] = (providers[p] || 0) + 1
    }
    const stats = {
      total: users.length,
      newToday: users.filter((u) => new Date(u.created_at) >= startOfToday).length,
      new7d: users.filter((u) => age(u.created_at) < 7 * DAY).length,
      prev7d: users.filter((u) => { const t = age(u.created_at); return t >= 7 * DAY && t < 14 * DAY }).length,
      active7d: users.filter((u) => age(u.last_sign_in_at) < 7 * DAY).length,
      providers,
    }

    return NextResponse.json({
      rows: matched.slice((page - 1) * perPage, page * perPage).map(slim),
      total: matched.length,
      page,
      perPage,
      stats,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load users' }, { status: 500 })
  }
}

async function loadFunnel(supabase: ReturnType<typeof createAdminClient>) {
  try {
    const [allUsers, profiles, appliedIds] = await Promise.all([
      allAuthUsers(supabase),
      collectProfiles(supabase),
      collectIds(supabase, 'live_application_queue', 'user_id'),
    ])
    return NextResponse.json(
      allUsers.map((user) => {
        const profile = profiles.get(user.id)
        return {
          id: user.id,
          created_at: user.created_at,
          provider: user.app_metadata?.provider || 'email',
          confirmed: !!user.email_confirmed_at,
          profile_started: !!profile,
          onboarding_complete: !!profile?.is_onboarding_complete,
          has_applied: appliedIds.has(user.id),
          heard_about_us: profile?.heard_about_us ?? null,
        }
      }),
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load funnel data' }, { status: 500 })
  }
}

import { cachedRoute } from "@/lib/server-cache"
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

export function GET(request: Request) {
  return cachedRoute(request, 60_000, () => load(request))
}

async function load(request: Request) {
  const supabase = createAdminClient()
  // ?funnel=1 is the Marketing page: signup facts and onboarding flags, no contact details.
  const withFunnel = new URL(request.url).searchParams.get('funnel') === '1'

  const allUsers: ReturnType<typeof supabase.auth.admin.listUsers> extends Promise<{ data: { users: infer U } }> ? U : never[] = []
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    allUsers.push(...(data.users as typeof allUsers))
    if (data.users.length < perPage) break
    page++
  }

  if (withFunnel) {
    try {
      const [profiles, appliedIds] = await Promise.all([collectProfiles(supabase), collectIds(supabase, 'live_application_queue', 'user_id')])
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

  const users = allUsers.map(user => ({
    id: user.id,
    email: user.email || 'No email',
    phone: user.phone || null,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    email_confirmed_at: user.email_confirmed_at,
    phone_confirmed_at: user.phone_confirmed_at,
    role: user.role,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    confirmed: !!user.email_confirmed_at,
    banned: !!user.banned_until,
    provider: user.app_metadata?.provider || 'email',
  }))

  return NextResponse.json(users)
}

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// Pages through a table's id column (PostgREST caps responses at 1000 rows).
async function collectIds(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  filter?: { column: string; value: boolean },
): Promise<Set<string>> {
  const ids = new Set<string>()
  const size = 1000
  for (let from = 0; ; from += size) {
    let q = supabase.from(table).select(column).range(from, from + size - 1)
    if (filter) q = q.eq(filter.column, filter.value)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
      const id = row[column]
      if (id) ids.add(id)
    }
    if (!data || data.length < size) break
  }
  return ids
}

export async function GET(request: Request) {
  const supabase = createAdminClient()
  // ?funnel=1 adds onboarding/application flags (used by the Marketing funnel).
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

  let profileIds: Set<string> | null = null
  let onboardedIds: Set<string> | null = null
  let appliedIds: Set<string> | null = null
  if (withFunnel) {
    try {
      ;[profileIds, onboardedIds, appliedIds] = await Promise.all([
        collectIds(supabase, 'profiles', 'id'),
        collectIds(supabase, 'profiles', 'id', { column: 'onboarding_complete', value: true }),
        collectIds(supabase, 'live_application_queue', 'user_id'),
      ])
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load funnel data' }, { status: 500 })
    }
  }

  const users = allUsers.map(user => ({
    ...(withFunnel ? {
      profile_started: profileIds!.has(user.id),
      onboarding_complete: onboardedIds!.has(user.id),
      has_applied: appliedIds!.has(user.id),
    } : {}),
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

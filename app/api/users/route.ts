import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

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

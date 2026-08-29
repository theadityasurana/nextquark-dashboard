import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createAdminClient()

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = data.users.map(user => ({
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

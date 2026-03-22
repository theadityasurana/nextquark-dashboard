import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, getTemplate, renderTemplate, getUserEmails } from '@/lib/email-service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_INACTIVE_DAYS = 7

// GET: Preview inactive users
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || String(DEFAULT_INACTIVE_DAYS))

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data: authData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const inactiveAuthUsers = (authData?.users || []).filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at < cutoff
  )

  const inactiveEmails = new Set(inactiveAuthUsers.map((u) => u.email))

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, first_name')

  const inactiveUsers = (profiles || [])
    .filter((p) => inactiveEmails.has(p.email))
    .map((p) => {
      const authUser = inactiveAuthUsers.find((u) => u.email === p.email)
      const lastSeen = authUser?.last_sign_in_at
      const daysInactive = lastSeen ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)) : null
      return { id: p.id, email: p.email, first_name: p.first_name, last_sign_in: lastSeen, days_inactive: daysInactive }
    })

  return NextResponse.json({ days, total: inactiveUsers.length, users: inactiveUsers })
}

// POST: Send inactivity nudge emails
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const days = body.days || DEFAULT_INACTIVE_DAYS

    const template = await getTemplate('inactivity_nudge')
    if (!template) return NextResponse.json({ error: 'inactivity_nudge template not found' }, { status: 404 })

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const { data: authData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const inactiveAuthUsers = (authData?.users || []).filter(
      (u) => u.last_sign_in_at && u.last_sign_in_at < cutoff
    )
    const inactiveEmails = new Set(inactiveAuthUsers.map((u) => u.email))

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, first_name')

    const targets = (profiles || []).filter((p) => inactiveEmails.has(p.email))

    let sent = 0, failed = 0
    for (const user of targets) {
      const authUser = inactiveAuthUsers.find((u) => u.email === user.email)
      const daysInactive = authUser?.last_sign_in_at
        ? Math.floor((Date.now() - new Date(authUser.last_sign_in_at).getTime()) / (1000 * 60 * 60 * 24))
        : days

      const html = renderTemplate(template.html_body, {
        first_name: user.first_name || 'there',
        days_inactive: String(daysInactive),
        app_url: process.env.NEXT_PUBLIC_APP_URL || 'https://nextquark.com',
      })

      const allEmails = await getUserEmails(user.id, user.email)
      const result = await sendEmail({
        to: allEmails,
        subject: template.subject,
        html,
        triggerType: 'inactivity_nudge',
      })
      result.success ? sent++ : failed++
    }

    return NextResponse.json({ success: true, sent, failed, total: targets.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

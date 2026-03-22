import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, getTemplate, renderTemplate, getUserEmails } from '@/lib/email-service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_THRESHOLD = 10

// GET: Preview users who hit milestones this month
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const threshold = parseInt(searchParams.get('threshold') || String(DEFAULT_THRESHOLD))

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const { data: apps } = await supabase
    .from('live_application_queue')
    .select('user_id, first_name, email')
    .gte('created_at', startOfMonth)

  const countByUser = new Map<string, { email: string; first_name: string; count: number }>()
  for (const app of apps || []) {
    const existing = countByUser.get(app.user_id)
    if (existing) {
      existing.count++
    } else {
      countByUser.set(app.user_id, { email: app.email, first_name: app.first_name, count: 1 })
    }
  }

  const milestoneUsers = Array.from(countByUser.entries())
    .filter(([, v]) => v.count >= threshold)
    .map(([userId, v]) => ({ user_id: userId, email: v.email, first_name: v.first_name, app_count: v.count }))

  return NextResponse.json({ threshold, total: milestoneUsers.length, users: milestoneUsers })
}

// POST: Send milestone celebration emails
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const threshold = body.threshold || DEFAULT_THRESHOLD

    const template = await getTemplate('milestone')
    if (!template) return NextResponse.json({ error: 'milestone template not found' }, { status: 404 })

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    const { data: apps } = await supabase
      .from('live_application_queue')
      .select('user_id, first_name, email')
      .gte('created_at', startOfMonth)

    const countByUser = new Map<string, { email: string; first_name: string; count: number }>()
    for (const app of apps || []) {
      const existing = countByUser.get(app.user_id)
      if (existing) {
        existing.count++
      } else {
        countByUser.set(app.user_id, { email: app.email, first_name: app.first_name, count: 1 })
      }
    }

    const targets = Array.from(countByUser.entries())
      .filter(([, v]) => v.count >= threshold)

    let sent = 0, failed = 0
    for (const [userId, user] of targets) {
      const html = renderTemplate(template.html_body, {
        first_name: user.first_name || 'there',
        app_count: String(user.count),
        app_url: process.env.NEXT_PUBLIC_APP_URL || 'https://nextquark.com',
      })

      const allEmails = await getUserEmails(userId, user.email)
      const result = await sendEmail({
        to: allEmails,
        subject: template.subject,
        html,
        triggerType: 'milestone',
      })
      result.success ? sent++ : failed++
    }

    return NextResponse.json({ success: true, sent, failed, total: targets.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

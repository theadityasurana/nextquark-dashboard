import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, getTemplate, renderTemplate, getUserEmails } from '@/lib/email-service'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The website A/B test's paywall group (first application only, then pay) gets no welcome
 * email: it promises 10 free applications. The website records the group just before it
 * creates the profile; we look once more after a short pause in case it is still landing.
 */
async function inPaywallGroup(userId: string): Promise<boolean> {
  const db = createAdminClient()
  for (let attempt = 0; attempt < 2; attempt++) {
    const [{ data: a }, { data: exp }] = await Promise.all([
      db.from('web_experiment_assignments').select('variant, run').eq('user_id', userId).eq('experiment', 'paywall_after_first').maybeSingle(),
      db.from('web_experiments').select('enabled, run').eq('key', 'paywall_after_first').maybeSingle(),
    ])
    if (a) return a.variant === 'paywall' && !!exp?.enabled && exp.run === a.run
    if (!exp?.enabled) return false
    await new Promise(r => setTimeout(r, 2500))
  }
  return false
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { record } = payload

    console.log('Profile created webhook received:', record)

    if (!record?.email) {
      console.error('No email in record:', record)
      return NextResponse.json({ error: 'No email found' }, { status: 400 })
    }

    // Admin "new signup" push is sent by /api/cron/admin-notify (every minute).

    if (record.id && (await inPaywallGroup(record.id).catch(() => false))) {
      return NextResponse.json({ skipped: 'paywall test group' })
    }

    const template = await getTemplate('welcome')
    if (!template) {
      console.error('Welcome template not found')
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    console.log('Using template:', template.name)

    const html = renderTemplate(template.html_body, {
      first_name: record.first_name || 'there',
      app_url: process.env.NEXT_PUBLIC_APP_URL || 'https://nextquark.com',
    })

    const allEmails = await getUserEmails(record.id, record.email)

    const result = await sendEmail({
      to: allEmails,
      subject: template.subject,
      html,
      triggerType: 'welcome',
    })

    console.log('Email send result:', result)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

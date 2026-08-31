import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, getTemplate, renderTemplate, getUserEmails } from '@/lib/email-service'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { record } = payload

    if (!record?.email) {
      return NextResponse.json({ error: 'No email found' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: settings } = await supabase.from('settings').select('application_submitted_emails_enabled').single()
    if (settings?.application_submitted_emails_enabled === false) {
      return NextResponse.json({ success: true, skipped: true })
    }

    const template = await getTemplate('application_submitted')
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const html = renderTemplate(template.html_body, {
      first_name: record.first_name || 'there',
      job_title: record.job_title || 'N/A',
      company_name: record.company_name || 'N/A',
      location: record.location || 'N/A',
    })

    const allEmails = await getUserEmails(record.user_id, record.email)

    await sendEmail({
      to: allEmails,
      subject: template.subject,
      html,
      triggerType: 'application_submitted',
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, getTemplate, renderTemplate, getProxyEmail } from '@/lib/email-service'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { record } = payload

    if (!record?.email) {
      return NextResponse.json({ error: 'No email found' }, { status: 400 })
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

    const proxyEmail = await getProxyEmail(record.email)

    await sendEmail({
      to: record.email,
      subject: template.subject,
      html,
      triggerType: 'application_submitted',
      cc: proxyEmail,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

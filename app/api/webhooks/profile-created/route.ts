import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, getTemplate, renderTemplate } from '@/lib/email-service'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { record } = payload

    if (!record?.email) {
      return NextResponse.json({ error: 'No email found' }, { status: 400 })
    }

    const template = await getTemplate('welcome')
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const html = renderTemplate(template.html_body, {
      first_name: record.first_name || 'there',
      app_url: process.env.NEXT_PUBLIC_APP_URL || 'https://nextquark.com',
    })

    await sendEmail({
      to: record.email,
      subject: template.subject,
      html,
      triggerType: 'welcome',
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

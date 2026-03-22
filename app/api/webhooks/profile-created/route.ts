import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, getTemplate, renderTemplate, getUserEmails } from '@/lib/email-service'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { record } = payload

    console.log('Profile created webhook received:', record)

    if (!record?.email) {
      console.error('No email in record:', record)
      return NextResponse.json({ error: 'No email found' }, { status: 400 })
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

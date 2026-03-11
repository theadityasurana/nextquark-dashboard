import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email-service'

export async function POST(req: NextRequest) {
  try {
    const { to } = await req.json()

    if (!to) {
      return NextResponse.json({ error: 'Email address required' }, { status: 400 })
    }

    const result = await sendEmail({
      to,
      subject: 'Test Email from HireSwipe',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Test Email</h2>
          <p>This is a test email to verify your SMTP configuration is working correctly.</p>
          <p>If you received this, your email system is set up properly! ✅</p>
        </div>
      `,
      triggerType: 'test',
    })

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Test email sent successfully' })
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

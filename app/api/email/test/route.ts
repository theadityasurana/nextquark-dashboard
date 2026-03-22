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
      subject: 'Test Email from NextQuark',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; }
            .banner { width: 100%; display: block; }
            .content { background: #f9f9f9; padding: 30px; }
            .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <div class="container">
            <img src="https://widujxpahzlpegzjjpqp.supabase.co/storage/v1/object/public/email-assets/email-banner.png" alt="NextQuark" class="banner" />
            <div class="content">
              <h2>Test Email ✅</h2>
              <p>This is a test email to verify your SMTP configuration is working correctly.</p>
              <p>If you received this, your email system is set up properly!</p>
              <div class="signature">
                <p style="margin: 0; font-weight: bold;">NextQuark Email System</p>
              </div>
            </div>
          </div>
        </body>
        </html>
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

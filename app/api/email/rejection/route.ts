import { NextResponse } from 'next/server'
import { sendEmail, getUserEmails } from '@/lib/email-service'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const { userId, profileEmail, firstName, jobTitle, companyName, queueId } = await req.json()

    if (!userId || !firstName || !jobTitle || !companyName || !queueId) {
      return NextResponse.json({ error: 'userId, queueId, firstName, jobTitle, and companyName are required' }, { status: 400 })
    }

    const emails = await getUserEmails(userId, profileEmail)
    if (!emails.length) {
      return NextResponse.json({ error: 'No email addresses found for this user' }, { status: 404 })
    }

    const subject = `Update on Your Application — ${jobTitle} at ${companyName}`

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <p>Hi ${firstName},</p>

        <p>Thank you for using NextQuark to apply for the <strong>${jobTitle}</strong> role at <strong>${companyName}</strong>. After reviewing applications, ${companyName} has chosen not to move forward with your candidacy at this point in time.</p>

        <p>We know how much effort goes into every application, and we genuinely appreciate your trust in NextQuark to help you find your next opportunity.</p>

        <p>The good news — new jobs are added to NextQuark every single day across hundreds of companies. Your perfect role is out there, and we're here to help you find it. Keep applying.</p>

        <p>Rooting for you,<br/>The NextQuark Team</p>
      </div>
    `

    const result = await sendEmail({
      to: emails,
      subject,
      html,
      triggerType: 'rejection',
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Delete the queue entry immediately after rejection email is sent
    const supabase = await createClient()
    await supabase
      .from('live_application_queue')
      .delete()
      .eq('id', queueId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface EmailOptions {
  to: string
  subject: string
  html: string
  triggerType: string
}

export async function sendEmail({ to, subject, html, triggerType }: EmailOptions) {
  try {
    console.log('Sending email with config:', {
      user: process.env.GMAIL_USER,
      hasPassword: !!process.env.GMAIL_APP_PASSWORD,
      to,
    })

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    await transporter.sendMail({
      from: `"NextQuark" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    })

    try {
      await supabase.from('email_logs').insert({
        recipient_email: to,
        subject,
        trigger_type: triggerType,
        status: 'sent',
      })
    } catch (dbError) {
      console.error('Failed to log email:', dbError)
    }

    return { success: true }
  } catch (error: any) {
    console.error('Email send error:', error)

    try {
      await supabase.from('email_logs').insert({
        recipient_email: to,
        subject,
        trigger_type: triggerType,
        status: 'failed',
        error_message: error.message,
      })
    } catch (dbError) {
      console.error('Failed to log error:', dbError)
    }

    return { success: false, error: error.message }
  }
}

export async function getTemplate(triggerType: string) {
  const { data } = await supabase
    .from('email_templates')
    .select('*')
    .eq('trigger_type', triggerType)
    .eq('is_active', true)
    .single()

  return data
}

export function renderTemplate(template: string, variables: Record<string, string>) {
  let rendered = template
  Object.keys(variables).forEach((key) => {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), variables[key])
  })
  return rendered
}

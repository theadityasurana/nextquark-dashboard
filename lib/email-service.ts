import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  triggerType: string
}

export async function sendEmail({ to, subject, html, triggerType }: EmailOptions) {
  const recipients = Array.isArray(to) ? to.filter(Boolean).join(', ') : to
  try {
    console.log('Sending email with config:', {
      user: process.env.GMAIL_USER,
      hasPassword: !!process.env.GMAIL_APP_PASSWORD,
      to: recipients,
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
      to: recipients,
      subject,
      html,
    })

    try {
      await supabase.from('email_logs').insert({
        recipient_email: recipients,
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
        recipient_email: recipients,
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

// Returns deduplicated list of emails for a user: auth email + profile email + proxy email
export async function getUserEmails(userId: string, profileEmail?: string): Promise<string[]> {
  const emails: string[] = []

  const { data } = await supabase.auth.admin.getUserById(userId)
  if (data?.user?.email) emails.push(data.user.email)

  if (profileEmail) emails.push(profileEmail)

  const { data: profile } = await supabase
    .from('profiles')
    .select('proxy_email')
    .eq('id', userId)
    .single()
  if (profile?.proxy_email) emails.push(profile.proxy_email)

  return [...new Set(emails.map((e) => e.toLowerCase()))]
}

export interface UserWithEmails {
  id: string
  email: string
  first_name: string
  all_emails: string[]
}

export async function getAllUsersWithEmails(): Promise<UserWithEmails[]> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, first_name')

  const { data: authData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authEmailMap = new Map((authData?.users || []).map((u) => [u.id, u.email]))

  return (profiles || []).map((p) => {
    const authEmail = authEmailMap.get(p.id)
    const all = [authEmail, p.email].filter(Boolean) as string[]
    return { ...p, all_emails: [...new Set(all.map((e) => e.toLowerCase()))] }
  })
}

export function renderTemplate(template: string, variables: Record<string, string>) {
  let rendered = template
  Object.keys(variables).forEach((key) => {
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), variables[key])
  })
  return rendered
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, getTemplate, renderTemplate, getUserEmails } from '@/lib/email-service'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PROFILE_FIELDS = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'phone', label: 'Phone Number' },
  { key: 'location', label: 'Location' },
  { key: 'headline', label: 'Headline' },
  { key: 'bio', label: 'Bio' },
  { key: 'resume_url', label: 'Resume' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'skills', label: 'Skills' },
  { key: 'experience', label: 'Work Experience' },
  { key: 'education', label: 'Education' },
] as const

function getIncompleteInfo(profile: Record<string, any>) {
  const missing = PROFILE_FIELDS.filter(({ key }) => {
    const val = profile[key]
    if (val == null || val === '') return true
    if (Array.isArray(val) && val.length === 0) return true
    if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) return true
    return false
  })

  const filled = PROFILE_FIELDS.length - missing.length
  const percentage = Math.round((filled / PROFILE_FIELDS.length) * 100)

  return { missing, percentage }
}

// GET: Preview which users have incomplete profiles
export async function GET() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, phone, location, headline, bio, resume_url, linkedin_url, skills, experience, education')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const incompleteUsers = (profiles || [])
    .map((p) => {
      const { missing, percentage } = getIncompleteInfo(p)
      return { id: p.id, email: p.email, first_name: p.first_name, completion: percentage, missing_fields: missing.map((m) => m.label) }
    })
    .filter((u) => u.completion < 80)
    .sort((a, b) => a.completion - b.completion)

  return NextResponse.json({ total: incompleteUsers.length, users: incompleteUsers })
}

// POST: Send complete-profile emails to all incomplete users (or a specific list)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const targetEmails: string[] | undefined = body.emails // optional: send to specific emails only

    const template = await getTemplate('complete_profile')
    if (!template) {
      return NextResponse.json({ error: 'complete_profile template not found' }, { status: 404 })
    }

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, phone, location, headline, bio, resume_url, linkedin_url, skills, experience, education')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const incompleteUsers = (profiles || [])
      .map((p) => ({ ...p, ...getIncompleteInfo(p) }))
      .filter((u) => u.percentage < 80)
      .filter((u) => !targetEmails || targetEmails.includes(u.email))

    let sent = 0
    let failed = 0

    for (const user of incompleteUsers) {
      const missingHtml = user.missing.map((m: { label: string }) => `<li>${m.label}</li>`).join('')
      const html = renderTemplate(template.html_body, {
        first_name: user.first_name || 'there',
        completion_percentage: String(user.percentage),
        missing_fields: missingHtml,
        app_url: process.env.NEXT_PUBLIC_APP_URL || 'https://nextquark.com',
      })

      const allEmails = await getUserEmails(user.id, user.email)
      const result = await sendEmail({
        to: allEmails,
        subject: template.subject,
        html,
        triggerType: 'complete_profile',
      })

      result.success ? sent++ : failed++
    }

    return NextResponse.json({ success: true, sent, failed, total: incompleteUsers.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { sendEmail, getTemplate, renderTemplate, getAllUsersWithEmails } from '@/lib/email-service'

const BROADCAST_TYPES = ['success_story', 'tips_advice', 'new_feature', 'new_companies'] as const

// POST: Send a broadcast email to all users
// Body: { type: 'success_story' | 'tips_advice' | 'new_feature' | 'new_companies', headline: string, content: string }
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { type, headline, content } = body

    if (!type || !BROADCAST_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${BROADCAST_TYPES.join(', ')}` }, { status: 400 })
    }
    if (!content) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const template = await getTemplate(type)
    if (!template) return NextResponse.json({ error: `${type} template not found` }, { status: 404 })

    const users = await getAllUsersWithEmails()

    // Map template type to its content variable name
    const contentVarMap: Record<string, string> = {
      success_story: 'story_content',
      tips_advice: 'tip_content',
      new_feature: 'feature_content',
      new_companies: 'companies_content',
    }

    const subject = renderTemplate(template.subject, { headline: headline || '' })

    let sent = 0, failed = 0
    for (const user of users) {
      const html = renderTemplate(template.html_body, {
        first_name: user.first_name || 'there',
        [contentVarMap[type]]: content,
        headline: headline || '',
        app_url: process.env.NEXT_PUBLIC_APP_URL || 'https://nextquark.com',
      })

      const result = await sendEmail({
        to: user.all_emails,
        subject,
        html,
        triggerType: type,
      })
      result.success ? sent++ : failed++
    }

    return NextResponse.json({ success: true, sent, failed, total: users.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

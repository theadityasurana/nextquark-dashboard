import { NextRequest, NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') || '100'

  const res = await fetch(`https://api.resend.com/emails/receiving?limit=${limit}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }

  const data = await res.json()

  const logs = (data.data || []).map((email: any) => ({
    id: email.id,
    from_email: email.from,
    proxy_address: Array.isArray(email.to) ? email.to[0] : email.to,
    subject: email.subject,
    body_text: null,
    live_application_queue_id: null,
    created_at: email.created_at,
  }))

  return NextResponse.json({ logs, total: logs.length, has_more: data.has_more })
}

import { NextResponse } from 'next/server'

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 })
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/enrich-experience`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({}),
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? `Edge function returned ${res.status}` }, { status: res.status })
  }

  return NextResponse.json(data)
}

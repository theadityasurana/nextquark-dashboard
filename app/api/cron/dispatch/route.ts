import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

const MAX_CONCURRENT = 3

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Read operator preferences — the same toggles shown in the UI.
  // If autoStart is OFF, the cron respects that and does nothing.
  const { data: settings } = await supabase
    .from('settings')
    .select('ui_preferences')
    .single()

  const prefs = settings?.ui_preferences ?? {}
  const autoStart: boolean = prefs.autoStart ?? false
  const premiumOnly: boolean = prefs.premiumOnly ?? false

  if (!autoStart) {
    return NextResponse.json({ dispatched: 0, reason: 'autoStart is OFF' })
  }

  // How many are already running? Don't exceed the cap.
  const { count: activeCount } = await supabase
    .from('live_application_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'processing')

  const slots = MAX_CONCURRENT - (activeCount ?? 0)
  if (slots <= 0) {
    return NextResponse.json({ dispatched: 0, reason: 'all slots occupied', active: activeCount })
  }

  // Fetch eligible pending rows — premium first, then oldest first.
  let query = supabase
    .from('live_application_queue')
    .select('id, first_name, last_name, company_name, is_premium')
    .eq('status', 'pending')
    .order('is_premium', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(slots)

  if (premiumOnly) {
    query = query.eq('is_premium', true)
  }

  const { data: pending, error } = await query

  if (error) {
    console.error('[cron/dispatch] failed to fetch pending rows:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ dispatched: 0, reason: premiumOnly ? 'no premium pending applications' : 'no pending applications' })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`

  // Fire-and-forget — do NOT await. auto-apply-queue runs a full browser
  // session (minutes), and Vercel Hobby functions time out in 10s.
  // We just kick off each job and return immediately.
  for (const app of pending) {
    fetch(`${baseUrl}/api/auto-apply-queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: app.id, stream: false }),
    }).catch(() => {})
  }

  console.log(`[cron/dispatch] fired=${pending.length} slots=${slots} premiumOnly=${premiumOnly}`)

  return NextResponse.json({
    fired: pending.length,
    premiumOnly,
    apps: pending.map(a => ({ id: a.id, name: `${a.first_name} ${a.last_name}`, company: a.company_name, premium: a.is_premium })),
  })
}

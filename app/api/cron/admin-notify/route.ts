import { NextRequest, NextResponse } from 'next/server'
import type { PushSubscription } from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAdminSubscriptions, sendAdminPush, type AdminPush } from '@/lib/admin-push'
import {
  fetchAdminEvents, healthNotification, signupNotification, upgradeNotification, type Health,
} from '@/lib/admin-events'
import { GET as getSystemHealth } from '@/app/api/system-health/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Fallback when admin_notify_state can't be read (PostgREST down): remember
// the last status in this warm instance so we don't re-announce every minute.
let memoryHealth: Health | null = null

/**
 * Called every minute by pg_cron job "admin-notify" (scripts/091). Sends web
 * push to the admin's browsers for new signups, new paid users, and Supabase
 * health changes. Works with the dashboard closed.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))

  let subs: PushSubscription[] = Array.isArray(body?.subscriptions) ? body.subscriptions : []
  if (!subs.length) {
    try { subs = await loadAdminSubscriptions() } catch { /* DB unreachable and nothing in body */ }
  }
  if (!subs.length) return NextResponse.json({ ok: true, skipped: 'no subscribers' })

  const supabase = createAdminClient()
  const pushes: AdminPush[] = []
  const report: Record<string, unknown> = {}

  // ── Health ──
  let health: Health = 'healthy'
  let detail = ''
  try {
    const res = await getSystemHealth()
    const data = await res.json()
    health = data.overallStatus as Health
    detail = (data.services ?? [])
      .filter((s: { status: Health }) => s.status !== 'healthy')
      .map((s: { name: string; status: Health }) => `${s.name}: ${s.status}`)
      .join(', ')
  } catch (e) {
    health = 'down'
    detail = `Health check failed: ${e instanceof Error ? e.message : 'unknown error'}`
  }
  report.health = health

  const { data: state, error: stateErr } = await supabase
    .from('admin_notify_state').select('events_cursor, health_status').eq('id', 1).maybeSingle()

  const prevHealth = (stateErr ? memoryHealth : (state?.health_status as Health | null)) ?? 'healthy'
  if (health !== prevHealth) {
    pushes.push(healthNotification(health, detail))
    memoryHealth = health
    if (!stateErr) {
      await supabase.from('admin_notify_state')
        .update({ health_status: health, updated_at: new Date().toISOString() }).eq('id', 1)
    }
  }

  // ── Signups / upgrades ── (needs the database; skipped while it's down)
  if (!stateErr) {
    const now = new Date().toISOString()
    const cursor = state?.events_cursor as string | null
    // Claim the window first: if another run already moved the cursor, the
    // conditional update matches nothing and we don't send twice.
    let claim = supabase.from('admin_notify_state').update({ events_cursor: now, updated_at: now }).eq('id', 1)
    claim = cursor ? claim.eq('events_cursor', cursor) : claim.is('events_cursor', null)
    const { data: claimed } = await claim.select('id')

    if (claimed?.length && cursor) {
      const { signups, upgrades, error } = await fetchAdminEvents(supabase, cursor)
      if (error) report.eventsError = error
      // Upgrades always individually (rare, important); a burst of signups is summarised.
      for (const u of upgrades) pushes.push(upgradeNotification(u))
      if (signups.length > 4) {
        pushes.push({
          title: `${signups.length} new signups 🎉`,
          body: signups.map((s) => s.name).slice(0, 6).join(', ') + (signups.length > 6 ? '…' : ''),
          tag: `signups-${now}`,
          url: '/users',
        })
      } else {
        for (const s of signups) pushes.push(signupNotification(s))
      }
      report.signups = signups.length
      report.upgrades = upgrades.length
    }
  }

  let sent = 0
  for (const p of pushes) {
    try { sent += (await sendAdminPush(p, subs)).sent } catch { /* keep going */ }
  }
  return NextResponse.json({ ok: true, notifications: pushes.length, sent, subscribers: subs.length, ...report })
}

export async function GET(req: NextRequest) {
  return POST(req)
}

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Feed for the dashboard's desktop notifier: signups and paid upgrades since a
 * cursor. The client stores the returned `now` as its next cursor, so the
 * server clock is the only clock that matters.
 */
export async function GET(req: NextRequest) {
  const now = new Date().toISOString()
  const sinceParam = req.nextUrl.searchParams.get('since')
  const sinceMs = sinceParam ? Date.parse(sinceParam) : NaN
  // No cursor yet (first run): just hand back one so we don't replay history.
  if (!Number.isFinite(sinceMs)) return Response.json({ now, signups: [], upgrades: [] })
  // Never look back more than a day, even after the laptop slept for a week.
  const since = new Date(Math.max(sinceMs, Date.now() - 24 * 60 * 60 * 1000)).toISOString()

  try {
    const supabase = createAdminClient()
    const [signupsRes, upgradesRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, location, created_at')
        .gt('created_at', since)
        .order('created_at', { ascending: true })
        .limit(25),
      supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, subscription_plan, billing_period, pricing_region, subscription_start_date')
        .eq('subscription_type', 'premium')
        .gt('subscription_start_date', since)
        .order('subscription_start_date', { ascending: true })
        .limit(25),
    ])

    const name = (r: any) =>
      r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Someone'

    return Response.json({
      now,
      signups: (signupsRes.data ?? []).map((r: any) => ({
        id: r.id, name: name(r), email: r.email ?? null, location: r.location ?? null, at: r.created_at,
      })),
      upgrades: (upgradesRes.data ?? []).map((r: any) => ({
        id: r.id, name: name(r), email: r.email ?? null,
        plan: r.subscription_plan ?? 'premium', period: r.billing_period ?? null, region: r.pricing_region ?? null,
        at: r.subscription_start_date,
      })),
      error: signupsRes.error?.message || upgradesRes.error?.message || undefined,
    })
  } catch (e) {
    // Keep the old cursor on failure so nothing is skipped.
    return Response.json({ now: sinceParam, signups: [], upgrades: [], error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

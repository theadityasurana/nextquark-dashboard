import type { SupabaseClient } from '@supabase/supabase-js'

export interface SignupEvent { id: string; name: string; email: string | null; location: string | null; at: string }
export interface UpgradeEvent {
  id: string; name: string; email: string | null
  plan: string; period: string | null; region: string | null; at: string
}

const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000

function displayName(r: any): string {
  return r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Someone'
}

/** Signups and new paid subscriptions after `since` (never more than a day back). */
export async function fetchAdminEvents(supabase: SupabaseClient, sinceIso: string) {
  const since = new Date(Math.max(Date.parse(sinceIso), Date.now() - MAX_LOOKBACK_MS)).toISOString()
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

  const error = signupsRes.error?.message || upgradesRes.error?.message
  const signups: SignupEvent[] = (signupsRes.data ?? []).map((r: any) => ({
    id: r.id, name: displayName(r), email: r.email ?? null, location: r.location ?? null, at: r.created_at,
  }))
  const upgrades: UpgradeEvent[] = (upgradesRes.data ?? []).map((r: any) => ({
    id: r.id, name: displayName(r), email: r.email ?? null,
    plan: r.subscription_plan ?? 'premium', period: r.billing_period ?? null, region: r.pricing_region ?? null,
    at: r.subscription_start_date,
  }))
  return { signups, upgrades, error }
}

/** Same wording and tags in the open-tab notifier and server push, so a
 *  notification arriving both ways replaces itself instead of doubling up. */
export function signupNotification(s: SignupEvent) {
  return {
    title: 'New signup',
    body: `${s.name}${s.location ? ` · ${s.location}` : ''} just joined Iris`,
    tag: `signup-${s.id}`,
    url: '/users',
  }
}

export function upgradeNotification(u: UpgradeEvent) {
  const plan = [u.plan, u.period].filter(Boolean).join(' · ')
  return { title: 'New paid user', body: `${u.name} upgraded to ${plan}`, tag: `paid-${u.id}`, url: '/pricing' }
}

export type Health = 'healthy' | 'degraded' | 'down'

export function healthNotification(status: Health, detail: string) {
  if (status === 'healthy') {
    return { title: 'Supabase recovered', body: 'All services are healthy again', tag: 'supabase-health', url: '/settings', urgent: false }
  }
  return {
    title: status === 'down' ? 'Supabase is DOWN' : 'Supabase degraded',
    body: detail || `Overall status: ${status}`,
    tag: 'supabase-health',
    url: '/settings',
    urgent: status === 'down',
  }
}

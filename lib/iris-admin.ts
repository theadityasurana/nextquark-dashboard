// The Iris website sections of this dashboard (A/B experiments, referrals, user actions).
// No password in the dashboard. The server reads irisjobs.live's referral admin API with the
// website's admin key, taken from REFERRAL_ADMIN_KEY or, if that isn't set, from the
// service-role-only table public.web_admin_secrets (key 'referral_admin_key'). Never from git.
import { createAdminClient } from '@/lib/supabase/admin'

export const IRIS_ORIGIN = 'https://irisjobs.live'

let cached: { value: string; at: number } | null = null

export async function irisAdminKey(): Promise<string> {
  if (process.env.REFERRAL_ADMIN_KEY) return process.env.REFERRAL_ADMIN_KEY
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.value
  try {
    const { data } = await createAdminClient().from('web_admin_secrets').select('value').eq('key', 'referral_admin_key').maybeSingle()
    const value = (data?.value as string | undefined) || ''
    if (value) cached = { value, at: Date.now() }
    return value
  } catch {
    return ''
  }
}

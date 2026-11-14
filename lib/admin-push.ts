import webpush, { type PushSubscription } from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

export interface AdminPush {
  title: string
  body: string
  url?: string
  tag?: string
  urgent?: boolean
}

let vapidReady = false
function initVapid(): boolean {
  if (vapidReady) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  const contact = process.env.VAPID_EMAIL || 'mailto:admin@nextquark.in'
  webpush.setVapidDetails(contact.startsWith('mailto:') || contact.startsWith('http') ? contact : `mailto:${contact}`, pub, priv)
  vapidReady = true
  return true
}

export async function loadAdminSubscriptions(): Promise<PushSubscription[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('admin_push_subscriptions').select('subscription')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => r.subscription as PushSubscription)
}

/**
 * Sends one notification to every admin browser. `subs` lets the caller pass
 * subscriptions it already has (the cron body), so this works even when the
 * database API is unreachable. Expired subscriptions are removed best-effort.
 */
export async function sendAdminPush(payload: AdminPush, subs?: PushSubscription[]) {
  if (!initVapid()) return { sent: 0, total: 0, error: 'VAPID keys not configured' }
  const list = subs ?? (await loadAdminSubscriptions())
  const body = JSON.stringify(payload)
  const gone: string[] = []
  const results = await Promise.allSettled(
    list.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, body, { TTL: 60 * 60, urgency: payload.urgent ? 'high' : 'normal' })
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(sub.endpoint)
        throw err
      }
    }),
  )
  if (gone.length) {
    try {
      await createAdminClient().from('admin_push_subscriptions').delete().in('endpoint', gone)
    } catch { /* retried next time it fails */ }
  }
  return { sent: results.filter((r) => r.status === 'fulfilled').length, total: list.length }
}

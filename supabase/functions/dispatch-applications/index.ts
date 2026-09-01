import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_CONCURRENT = 3

Deno.serve(async (req) => {
  // Allow pg_cron (internal) and the insert trigger to call this without auth,
  // but protect against external callers with the same CRON_SECRET.
  // Edge Functions require a valid Supabase JWT in Authorization.
  // We additionally check X-Cron-Secret for calls from pg_cron/pg_net.
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
  const incomingSecret = req.headers.get('x-cron-secret') ?? ''
  if (cronSecret && incomingSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: settings } = await supabase
    .from('settings')
    .select('ui_preferences')
    .single()

  const prefs = settings?.ui_preferences ?? {}
  const autoStart: boolean = prefs.autoStart ?? false
  const premiumOnly: boolean = prefs.premiumOnly ?? false

  if (!autoStart) {
    return new Response(JSON.stringify({ dispatched: 0, reason: 'autoStart is OFF' }))
  }

  const { count: activeCount } = await supabase
    .from('live_application_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'processing')

  const slots = MAX_CONCURRENT - (activeCount ?? 0)
  if (slots <= 0) {
    return new Response(JSON.stringify({ dispatched: 0, reason: 'all slots occupied', active: activeCount }))
  }

  let query = supabase
    .from('live_application_queue')
    .select('id, first_name, last_name, company_name, is_premium')
    .eq('status', 'pending')
    .order('is_premium', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(slots)

  if (premiumOnly) query = query.eq('is_premium', true)

  const { data: pending, error } = await query
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!pending?.length) {
    return new Response(JSON.stringify({ dispatched: 0, reason: premiumOnly ? 'no premium pending' : 'no pending' }))
  }

  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL')!

  // Fire each application — EdgeRuntime keeps the event loop alive until
  // all promises settle, so these calls are NOT dropped like Vercel fire-and-forget.
  await Promise.allSettled(
    pending.map((app) =>
      fetch(`${appUrl}/api/auto-apply-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId: app.id, stream: false }),
      })
    )
  )

  return new Response(JSON.stringify({
    fired: pending.length,
    premiumOnly,
    apps: pending.map((a) => ({ id: a.id, name: `${a.first_name} ${a.last_name}`, company: a.company_name, premium: a.is_premium })),
  }))
})

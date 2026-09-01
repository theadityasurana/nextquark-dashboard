import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BATCH_SIZE = 5

Deno.serve(async (req) => {
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

  const { data: entries, error } = await supabase
    .from('job_sync_queue')
    .select('id, company_id')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error || !entries?.length) {
    return new Response(JSON.stringify({ message: 'No pending syncs due' }))
  }

  const entryIds = entries.map((e) => e.id)
  const companyIds = entries.map((e) => e.company_id)

  await Promise.all([
    supabase.from('job_sync_queue').update({ status: 'running' }).in('id', entryIds),
    supabase.from('companies').update({ sync_status: 'running' }).in('id', companyIds),
  ])

  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL')!

  // Edge Function keeps the event loop alive until all fetches settle —
  // the ATS sync actually runs instead of being dropped like Vercel after().
  await Promise.allSettled(
    entries.map((entry) =>
      fetch(`${appUrl}/api/cron/process-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ entryId: entry.id, companyId: entry.company_id }),
      })
    )
  )

  return new Response(JSON.stringify({
    triggered: entries.length,
    entryIds,
  }))
})

import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** GET ?ids=a,b,c → { [userId]: 'paywall' | 'control' } for the website A/B test. */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get('ids') || '')
    .split(',').map(s => s.trim()).filter(s => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 500)
  if (!ids.length) return Response.json({})
  const { data, error } = await createAdminClient()
    .from('web_experiment_assignments').select('user_id, variant').in('user_id', ids)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(Object.fromEntries((data ?? []).map(r => [r.user_id, r.variant])), { headers: { 'Cache-Control': 'no-store' } })
}

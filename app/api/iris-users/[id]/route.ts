import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }
const isId = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

/** POST { action: 'reset-swipes' } → free swipes back to the configured allowance, timer cleared. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params
  if (!isId(id)) return Response.json({ error: 'Bad user id.' }, { status: 400 })
  let body: { action?: string } = {}
  try { body = await req.json() } catch { /* empty */ }
  if (body.action !== 'reset-swipes') return Response.json({ error: 'Unknown action.' }, { status: 400 })

  const db = createAdminClient()
  const { data: limits } = await db.from('remote_config').select('value').eq('key', 'limits').maybeSingle()
  const n = Number((limits?.value as { free_swipes_per_cycle?: number } | null)?.free_swipes_per_cycle) || 10
  const { error } = await db.from('profiles')
    .update({ daily_swipes_remaining: n, applications_remaining: n, daily_swipes_reset_at: null })
    .eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, swipes: n })
}

/** DELETE → removes the account and everything tied to it. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  if (!isId(id)) return Response.json({ error: 'Bad user id.' }, { status: 400 })
  const db = createAdminClient()
  // Two links don't clean themselves up: people this user referred, and their application
  // queue rows. Everything else (profile, resumes, emails, subscriptions…) cascades.
  const r1 = await db.from('profiles').update({ referred_by: null }).eq('referred_by', id)
  if (r1.error) return Response.json({ error: `Could not unlink referrals: ${r1.error.message}` }, { status: 500 })
  const r2 = await db.from('live_application_queue').delete().eq('user_id', id)
  if (r2.error) return Response.json({ error: `Could not remove applications: ${r2.error.message}` }, { status: 500 })
  const { error } = await db.auth.admin.deleteUser(id)
  if (error) return Response.json({ error: `Could not delete: ${error.message}` }, { status: 500 })
  return Response.json({ ok: true })
}

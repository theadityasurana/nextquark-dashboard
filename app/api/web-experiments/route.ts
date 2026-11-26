import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const KEY = 'paywall_after_first'

/** Settings + results for the website "pay after first application" experiment. */
export async function GET() {
  const db = createAdminClient()
  const [{ data: settings, error: e1 }, { data: results, error: e2 }] = await Promise.all([
    db.from('web_experiments').select('key, enabled, paywall_percent, run, started_at, updated_at').eq('key', KEY).maybeSingle(),
    db.rpc('web_experiment_results', { p_experiment: KEY }),
  ])
  if (e1 || e2) return Response.json({ error: (e1 || e2)?.message }, { status: 500 })
  return Response.json({ settings, results: results ?? [] })
}

/** { enabled?, percent?, newRun? } — newRun starts a fresh run (only sign-ups from now on count). */
export async function POST(req: Request) {
  let body: { enabled?: boolean; percent?: number; newRun?: boolean }
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }) }
  const db = createAdminClient()
  const { data: cur } = await db.from('web_experiments').select('run, enabled').eq('key', KEY).maybeSingle()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.enabled === 'boolean') {
    patch.enabled = body.enabled
    // Turning it on for the first time starts the clock: only accounts made from now on take part.
    if (body.enabled && !cur?.enabled && cur?.run === 'run-1') patch.started_at = new Date().toISOString()
  }
  if (body.percent !== undefined) {
    const p = Math.round(Number(body.percent))
    if (!Number.isFinite(p) || p < 0 || p > 100) return Response.json({ error: 'Split must be 0–100%.' }, { status: 400 })
    patch.paywall_percent = p
  }
  if (body.newRun) {
    const n = Number(String(cur?.run || 'run-1').replace(/\D/g, '')) || 1
    patch.run = `run-${n + 1}`
    patch.started_at = new Date().toISOString()
  }
  const { data, error } = await db.from('web_experiments').update(patch).eq('key', KEY).select().maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ settings: data })
}

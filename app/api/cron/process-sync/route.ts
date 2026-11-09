import { createAdminClient } from '@/lib/supabase/admin'
import { syncCompanyJobs } from '@/lib/ats-sync'
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'

export const maxDuration = 300

// How many companies to process per cron tick (every 30 min). With ~1,600
// ATS companies scheduled once a day, 48 ticks x 40 = 1,920 syncs/day keeps
// every company on a daily refresh.
const BATCH_SIZE = 40

// How many of those run at once. Each is capped by COMPANY_TIMEOUT_MS, so a
// batch takes at most (BATCH_SIZE / CONCURRENCY) x 45s = 180s, under the 300s limit.
const CONCURRENCY = 10

// Per-company timeout: if one ATS API hangs, it shouldn't block the whole batch.
const COMPANY_TIMEOUT_MS = 45_000 // 45 seconds per company

async function syncWithTimeout(
  companyId: string,
  atsType: string,
  atsCompanyId: string
): Promise<{ ok: true; result: Awaited<ReturnType<typeof syncCompanyJobs>> } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: `Timed out after ${COMPANY_TIMEOUT_MS / 1000}s` })
    }, COMPANY_TIMEOUT_MS)

    syncCompanyJobs(companyId, atsType, atsCompanyId)
      .then(result => { clearTimeout(timer); resolve({ ok: true, result }) })
      .catch(err => { clearTimeout(timer); resolve({ ok: false, error: err?.message || String(err) }) })
  })
}

async function runSyncBatch(entries: Array<{ id: string; company_id: string }>) {
  const supabase = createAdminClient()

  // Fetch all company configs in one query instead of N queries inside the loop
  const companyIds = entries.map(e => e.company_id)
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, ats_type, ats_company_id')
    .in('id', companyIds)

  const companyMap = new Map((companies || []).map(c => [c.id, c]))

  // Run all companies in parallel — each has its own timeout so one slow ATS
  // can't block the others or cause the whole batch to time out on Vercel.
  const syncEntry = async (entry: { id: string; company_id: string }) => {
    const company = companyMap.get(entry.company_id)

    if (!company?.ats_type || !company?.ats_company_id) {
      await supabase
        .from('job_sync_queue')
        .update({ status: 'failed', synced_at: new Date().toISOString(), result: { error: 'Missing ATS config' } })
        .eq('id', entry.id)
      await supabase.from('companies').update({ sync_status: 'failed' }).eq('id', entry.company_id)
      return
    }

    const outcome = await syncWithTimeout(company.id, company.ats_type, company.ats_company_id)

    if (outcome.ok) {
      await supabase
        .from('job_sync_queue')
        .update({ status: 'done', synced_at: new Date().toISOString(), result: outcome.result })
        .eq('id', entry.id)
      await supabase
        .from('companies')
        .update({ sync_status: 'success', last_synced_at: new Date().toISOString() })
        .eq('id', company.id)
    } else {
      console.error(`[process-sync] failed for ${company.name}: ${outcome.error}`)
      await supabase
        .from('job_sync_queue')
        .update({ status: 'failed', synced_at: new Date().toISOString(), result: { error: outcome.error } })
        .eq('id', entry.id)
      await supabase
        .from('companies')
        .update({ sync_status: 'failed', last_synced_at: new Date().toISOString() })
        .eq('id', company.id)
    }
  }

  const pending = [...entries]
  await Promise.allSettled(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
    for (let entry = pending.shift(); entry; entry = pending.shift()) {
      try { await syncEntry(entry) } catch (err) { console.error('[process-sync] entry crashed:', err) }
    }
  }))
}

// Called every 30 min by Vercel cron (GET) or pg_cron via pg_net (POST)
export async function GET(request: NextRequest) {
  return handler(request)
}
export async function POST(request: NextRequest) {
  return handler(request)
}

async function handler(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // When called from the Edge Function, a single entry is passed in the body.
  // When called directly (Vercel cron fallback), we query for the batch ourselves.
  let entries: Array<{ id: string; company_id: string }> | null = null

  const body = request.method === 'POST'
    ? await request.json().catch(() => ({}))
    : {}

  if (body.entryId && body.companyId) {
    // Single-entry mode: Edge Function already marked it running
    entries = [{ id: body.entryId, company_id: body.companyId }]
  } else {
    const { data, error } = await supabase
      .from('job_sync_queue')
      .select('id, company_id')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (error || !data || data.length === 0) {
      return NextResponse.json({ message: 'No pending syncs due' })
    }

    entries = data
    const entryIds = entries.map(e => e.id)
    const companyIds = entries.map(e => e.company_id)
    await Promise.all([
      supabase.from('job_sync_queue').update({ status: 'running' }).in('id', entryIds),
      supabase.from('companies').update({ sync_status: 'running' }).in('id', companyIds),
    ])
  }

  after(runSyncBatch(entries))

  return NextResponse.json({ message: `Sync started for ${entries.length} companies`, entryIds: entries.map(e => e.id) })
}

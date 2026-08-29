import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// Jobs stuck in 'processing' for more than 15 minutes are reset to 'pending'
// so the queue picks them up again on the next cycle.
// Syncs stuck in 'running' for more than 20 minutes are reset to 'pending'.
// Also resets the distributed concurrency gate if it drifts out of sync.
const STUCK_JOB_THRESHOLD_MS  = 15 * 60 * 1000  // 15 minutes
const STUCK_SYNC_THRESHOLD_MS = 20 * 60 * 1000  // 20 minutes

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
  const now = new Date()
  const jobCutoff  = new Date(now.getTime() - STUCK_JOB_THRESHOLD_MS).toISOString()
  const syncCutoff = new Date(now.getTime() - STUCK_SYNC_THRESHOLD_MS).toISOString()

  // 1. Move all non-completed jobs older than 15 minutes to completed
  const { data: stuckJobs, error: jobError } = await supabase
    .from('live_application_queue')
    .update({
      status: 'completed',
      completed_at: now.toISOString(),
    })
    .neq('status', 'completed')
    .lt('created_at', jobCutoff)
    .select('id, first_name, last_name, company_name')

  if (jobError) {
    console.error('[watchdog] failed to reset stuck jobs:', jobError.message)
  }

  // 2. Reset stuck sync queue entries
  const { data: stuckSyncs, error: syncError } = await supabase
    .from('job_sync_queue')
    .update({ status: 'pending' })
    .eq('status', 'running')
    .lt('synced_at', syncCutoff)
    .select('id, company_id')

  if (syncError) {
    console.error('[watchdog] failed to reset stuck syncs:', syncError.message)
  }

  // Also reset the company sync_status for stuck syncs
  if (stuckSyncs && stuckSyncs.length > 0) {
    const companyIds = stuckSyncs.map(s => s.company_id)
    await supabase
      .from('companies')
      .update({ sync_status: 'pending' })
      .in('id', companyIds)
  }

  // 3. Reconcile the distributed concurrency gate.
  // Count how many jobs are actually processing right now and correct the gate
  // if it drifted (e.g. a function was killed before it could release its slot).
  const { count: actuallyProcessing } = await supabase
    .from('live_application_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'processing')

  if (actuallyProcessing !== null) {
    await supabase
      .from('kernel_concurrency_gate')
      .update({ active_count: actuallyProcessing, updated_at: now.toISOString() })
      .eq('id', 'singleton')
  }

  const resetJobs  = stuckJobs?.length  ?? 0
  const resetSyncs = stuckSyncs?.length ?? 0

  console.log(`[watchdog] reset ${resetJobs} stuck jobs, ${resetSyncs} stuck syncs, gate reconciled to ${actuallyProcessing ?? '?'} active`)

  return NextResponse.json({
    resetJobs,
    resetSyncs,
    gateReconciled: actuallyProcessing ?? null,
    stuckJobs: stuckJobs?.map(j => ({ id: j.id, name: `${j.first_name} ${j.last_name}`, company: j.company_name })) ?? [],
  })
}

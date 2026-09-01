import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// Syncs stuck in 'running' for more than 20 minutes are reset to 'pending'.
// Also resets the distributed concurrency gate if it drifts out of sync.
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
  const syncCutoff = new Date(now.getTime() - STUCK_SYNC_THRESHOLD_MS).toISOString()

  // 1. Reset stuck sync queue entries
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

  // 2. Reconcile the distributed concurrency gate.
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

  const resetSyncs = stuckSyncs?.length ?? 0

  console.log(`[watchdog] reset ${resetSyncs} stuck syncs, gate reconciled to ${actuallyProcessing ?? '?'} active`)

  return NextResponse.json({
    resetSyncs,
    gateReconciled: actuallyProcessing ?? null,
  })
}

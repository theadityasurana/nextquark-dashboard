import { cachedValue, invalidateCached } from '@/lib/server-cache'
import { createAdminClient } from '@/lib/supabase/admin'

// Columns the queue screen actually renders — avoids pulling large JSONB fields
// (experience, education, run_timeline, answer_bank) on every queue load.
const QUEUE_COLUMNS = [
  'id', 'user_id', 'job_id', 'first_name', 'last_name', 'email', 'phone',
  'company_name', 'job_title', 'job_url', 'status', 'created_at', 'started_at',
  'completed_at', 'attempt_count', 'max_attempts', 'last_error', 'error_message',
  'recording_url', 'live_url', 'verification_otp', 'rejected_at',
  'is_premium', 'confirmation_id', 'failed_step', 'knockout_blocked',
  'knockout_reason', 'coverage_percent', 'coverage_blocking_missing',
].join(', ')

const STATUSES = ['pending', 'processing', 'completed', 'failed', 'awaiting_otp', 'awaiting_captcha', 'blocked'] as const
const LIVE = ['processing', 'awaiting_otp', 'awaiting_captcha']

/**
 * Status counts for the strip and tabs. Head-only count queries (no rows leave
 * Postgres), shared for a few seconds so a burst of realtime events from many
 * running applications doesn't turn into a burst of identical counts.
 */
function queueCounts(supabase: ReturnType<typeof createAdminClient>, premiumOnly: boolean) {
  return cachedValue(`queue-counts:${premiumOnly}`, 3_000, async () => {
    const head = () => supabase.from('live_application_queue').select('id', { count: 'exact', head: true })
    const [all, premium, freePending, eligible, ...byStatus] = await Promise.all([
      head(),
      head().eq('is_premium', true),
      head().eq('status', 'pending').or('is_premium.is.null,is_premium.eq.false'),
      premiumOnly ? head().eq('status', 'pending').eq('is_premium', true) : head().eq('status', 'pending'),
      ...STATUSES.map((st) => head().eq('status', st)),
    ])
    const failed = [all, premium, freePending, eligible, ...byStatus].find((r) => r.error)
    if (failed?.error) throw new Error(failed.error.message)
    const counts: Record<string, number> = { all: all.count ?? 0, premium: premium.count ?? 0 }
    STATUSES.forEach((st, i) => { counts[st] = byStatus[i].count ?? 0 })
    counts.live = LIVE.reduce((n, st) => n + (counts[st] ?? 0), 0)
    return { counts, freePending: freePending.count ?? 0, eligiblePending: eligible.count ?? 0 }
  })
}

/**
 * GET /api/live-queue?page=1&limit=25&tab=all|live|premium|<status>&q=&user=&premiumOnly=1
 *   → { rows, total, page, limit, counts, freePending, eligiblePending }
 * GET /api/live-queue?candidates=1 → people with pending applications, for the filter
 *
 * Paged and filtered in Postgres. The screen used to download every row (and
 * re-download it every minute), which grows without bound with the queue.
 */
export async function GET(request: Request) {
  try {
    const supabase = createAdminClient()
    const sp = new URL(request.url).searchParams

    if (sp.get('candidates') === '1') {
      const list = await cachedValue('queue-candidates', 30_000, async () => {
        const map = new Map<string, { user_id: string; name: string; pending: number }>()
        for (let from = 0; from < 20_000; from += 1000) {
          const { data, error } = await supabase
            .from('live_application_queue')
            .select('user_id, first_name, last_name')
            .eq('status', 'pending')
            .order('id', { ascending: true })
            .range(from, from + 999)
          if (error) throw new Error(error.message)
          for (const r of data ?? []) {
            const cur = map.get(r.user_id) ?? { user_id: r.user_id, name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(), pending: 0 }
            cur.pending++
            map.set(r.user_id, cur)
          }
          if (!data || data.length < 1000) break
        }
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
      })
      return Response.json(list)
    }

    const page = Math.max(1, Number(sp.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 25))
    const tab = sp.get('tab') || 'all'
    const q = (sp.get('q') || '').trim().replace(/[%_,()]/g, ' ')
    const user = sp.get('user')
    const premiumOnly = sp.get('premiumOnly') === '1'
    const from = (page - 1) * limit

    let query = supabase
      .from('live_application_queue')
      .select(QUEUE_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + limit - 1)
    if (tab === 'live') query = query.in('status', LIVE)
    else if (tab === 'premium') query = query.eq('is_premium', true)
    else if ((STATUSES as readonly string[]).includes(tab)) query = query.eq('status', tab)
    if (user) query = query.eq('user_id', user)
    if (q) {
      const words = q.split(/\s+/).filter(Boolean)
      // Each word must match a name, the company or the job title.
      for (const w of words) query = query.or(`first_name.ilike.%${w}%,last_name.ilike.%${w}%,company_name.ilike.%${w}%,job_title.ilike.%${w}%`)
    }

    const [{ data, error, count }, summary] = await Promise.all([query, queueCounts(supabase, premiumOnly)])
    if (error) {
      console.error('Supabase error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json({ rows: data ?? [], total: count ?? 0, page, limit, ...summary })
  } catch (err) {
    console.error('Fetch error:', err)
    return Response.json({ error: err instanceof Error ? err.message : 'Failed to fetch' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  invalidateCached('queue-')
  try {
    const body = await request.json()
    const supabase = createAdminClient()

    if (body.deleteAllPending) {
      const { error } = await supabase.from('live_application_queue').delete().eq('status', 'pending')
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true })
    }

    const { id } = body
    const { error } = await supabase.from('live_application_queue').delete().eq('id', id)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Failed to delete' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  invalidateCached('queue-')
  try {
    const body = await request.json()
    if (body.completeFreePending) {
      const supabase = createAdminClient()
      const { error } = await supabase
        .from('live_application_queue')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('status', 'pending')
        .eq('is_premium', false)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ success: true })
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 })
  } catch {
    return Response.json({ error: 'Failed to process' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  invalidateCached('queue-')
  try {
    const body = await request.json()
    const { id, recording_url, status, verification_otp, last_error, attempt_count, rejected_at } = body

    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

    const updateData: Record<string, unknown> = {}
    if (recording_url    !== undefined) updateData.recording_url    = recording_url
    if (status           !== undefined) updateData.status           = status
    if (verification_otp !== undefined) updateData.verification_otp = verification_otp
    if (last_error       !== undefined) updateData.last_error       = last_error
    if (attempt_count    !== undefined) updateData.attempt_count    = attempt_count
    if (rejected_at      !== undefined) updateData.rejected_at      = rejected_at

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('live_application_queue')
      .update(updateData)
      .eq('id', id)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Failed to update' }, { status: 500 })
  }
}

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

export async function GET() {
  try {
    const supabase = createAdminClient()
    // Paged: PostgREST caps one select at 1000 rows, which froze every queue
    // count (Total, Done, Failed…) at 1000. id breaks created_at ties so pages
    // never skip or repeat a row.
    const rows: unknown[] = []
    for (let from = 0; from < 50_000; from += 1000) {
      const { data, error } = await supabase
        .from('live_application_queue')
        .select(QUEUE_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + 999)

      if (error) {
        console.error('Supabase error:', error)
        return Response.json({ error: error.message }, { status: 500 })
      }
      if (!data?.length) break
      rows.push(...data)
      if (data.length < 1000) break
    }

    return Response.json(rows)
  } catch (err) {
    console.error('Fetch error:', err)
    return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
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

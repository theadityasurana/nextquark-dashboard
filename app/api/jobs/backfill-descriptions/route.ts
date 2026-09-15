import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

const BATCH_SIZE = 200

function cleanDescription(raw: string): string {
  if (!raw) return ''
  let text = raw
  for (let i = 0; i < 8; i++) {
    const prev = text
    text = text
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/')
    text = text.replace(/<[^>]*>/g, ' ')
    if (text === prev) break
  }
  return text.replace(/\s+/g, ' ').trim().substring(0, 500)
}

function isDirty(desc: string): boolean {
  return /&lt;|&gt;|&amp;lt;|&amp;gt;|<[a-z]/i.test(desc)
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const body = await request.json().catch(() => ({}))
  const { offset = 0, sessionId: existingSessionId, totalDirty = 0 } = body

  // On first call (offset=0), create a sync_sessions row so the progress bar appears
  let sessionId = existingSessionId
  if (offset === 0) {
    // Count total dirty jobs first for accurate progress
    const { count: dirtyCount } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .or('description.ilike.%&lt;%,description.ilike.%&amp;lt;%,description.ilike.%<div%,description.ilike.%<p>%')

    const { data: session } = await supabase
      .from('sync_sessions')
      .insert({
        type: 'backfill_desc',
        total: dirtyCount ?? 0,
        done: 0, failed: 0, added: 0, updated: 0, deleted: 0,
        results: [],
      })
      .select('id').single()
    sessionId = session?.id ?? null
  }

  // Fetch only id + description — minimal payload
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, description')
    .range(offset, offset + BATCH_SIZE - 1)
    .order('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!jobs?.length) {
    // Done — mark session complete
    if (sessionId) {
      await supabase.from('sync_sessions').update({
        status: 'done', finished_at: new Date().toISOString(),
      }).eq('id', sessionId)
    }
    return NextResponse.json({ done: true, sessionId })
  }

  const dirty = jobs.filter(j => j.description && isDirty(j.description))

  // Sequential updates — one at a time, no parallel blasting
  let updated = 0
  for (const j of dirty) {
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ description: cleanDescription(j.description) })
      .eq('id', j.id)
    if (!updateError) updated++
  }

  const newTotalDirty = totalDirty + updated
  const hasMore = jobs.length === BATCH_SIZE
  const nextOffset = offset + BATCH_SIZE

  // Update session progress
  if (sessionId) {
    await supabase.from('sync_sessions').update({
      done: newTotalDirty,
      updated: newTotalDirty,
    }).eq('id', sessionId)
  }

  if (!hasMore) {
    if (sessionId) {
      await supabase.from('sync_sessions').update({
        status: 'done', finished_at: new Date().toISOString(),
      }).eq('id', sessionId)
    }
    return NextResponse.json({ done: true, sessionId, totalCleaned: newTotalDirty })
  }

  // Self-invoke next batch — fire and forget, client watches sync_sessions via Realtime
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  fetch(`${baseUrl}/api/jobs/backfill-descriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offset: nextOffset, sessionId, totalDirty: newTotalDirty }),
  }).catch(() => {})

  return NextResponse.json({ done: false, sessionId, offset, updated, nextOffset })
}

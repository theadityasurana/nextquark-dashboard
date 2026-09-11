import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

export async function POST(_request: NextRequest) {
  try {
    const supabase = createAdminClient()

    const { count } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .not('ats_type', 'is', null)
      .not('ats_company_id', 'is', null)

    const total = count ?? 0

    if (!total) {
      return NextResponse.json({ error: 'No companies with ATS integration found' }, { status: 400 })
    }

    const { data: session, error: sessionError } = await supabase
      .from('sync_sessions')
      .insert({ type: 'cleanup', total, done: 0, failed: 0, added: 0, updated: 0, deleted: 0, results: [] })
      .select('id')
      .single()

    if (sessionError || !session) {
      console.error('[cleanup-jobs] failed to create session:', sessionError)
      return NextResponse.json({ error: 'Failed to create cleanup session' }, { status: 500 })
    }

    const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cleanup-companies`
    fetch(edgeFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ sessionId: session.id }),
    }).catch(err => console.error('[cleanup-jobs] edge function invoke error:', err))

    console.log(`[cleanup-jobs] session=${session.id} created, edge function invoked`)
    return NextResponse.json({ sessionId: session.id, total })
  } catch (error: any) {
    console.error('[cleanup-jobs] error:', error)
    return NextResponse.json({ error: 'Cleanup failed to start' }, { status: 500 })
  }
}

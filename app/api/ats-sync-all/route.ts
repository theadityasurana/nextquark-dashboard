import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 15

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()

    const { count } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .not('ats_type', 'is', null)
      .not('ats_company_id', 'is', null)

    const total = count ?? 0

    const { data: session, error: sessionError } = await supabase
      .from('sync_sessions')
      .insert({ type: 'sync', total, done: 0, failed: 0, added: 0, updated: 0, deleted: 0, results: [] })
      .select('id')
      .single()

    if (sessionError || !session) {
      console.error('[ats-sync-all] failed to create session:', sessionError)
      return NextResponse.json({ error: 'Failed to create sync session' }, { status: 500 })
    }

    // Invoke the Edge Function — it runs on Deno with no timeout, fully independent
    // of this Next.js function. Fire-and-forget: we don't await the response.
    const edgeFnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-companies`
    fetch(edgeFnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ sessionId: session.id }),
    }).catch(err => console.error('[ats-sync-all] edge function invoke error:', err))

    console.log(`[ats-sync-all] session=${session.id} created, edge function invoked`)
    return NextResponse.json({ sessionId: session.id, total })
  } catch (error: any) {
    console.error('[ats-sync-all] error:', error)
    return NextResponse.json({ error: 'Sync failed to start' }, { status: 500 })
  }
}

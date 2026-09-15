import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = createAdminClient()
  const { sessionId } = await request.json()

  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

  const { error } = await supabase
    .from('sync_sessions')
    .update({ status: 'cancelled', finished_at: new Date().toISOString() })
    .eq('id', sessionId)
    .in('status', ['running', 'done']) // cancel even if a race condition already set it done

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

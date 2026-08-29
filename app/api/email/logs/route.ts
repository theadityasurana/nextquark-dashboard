import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const page  = parseInt(new URL(request.url).searchParams.get('page')  || '1')
  const limit = parseInt(new URL(request.url).searchParams.get('limit') || '100')
  const from  = (page - 1) * limit

  // Only the columns the email logs table renders
  const { data, error, count } = await supabase
    .from('email_logs')
    .select('id, recipient_email, subject, trigger_type, status, error_message, sent_at', { count: 'exact' })
    .order('sent_at', { ascending: false })
    .range(from, from + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ logs: data || [], total: count || 0, page, limit })
}

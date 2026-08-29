import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { count, error } = await supabase
      .from('live_application_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ count: count || 0 })
  } catch {
    return Response.json({ error: 'Failed to fetch count' }, { status: 500 })
  }
}

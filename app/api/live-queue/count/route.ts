import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { count, error } = await supabase
      .from('live_application_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ count: count || 0 })
  } catch (err) {
    return Response.json({ error: 'Failed to fetch count' }, { status: 500 })
  }
}

import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('live_application_queue')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data)
  } catch {
    return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

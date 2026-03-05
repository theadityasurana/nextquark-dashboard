import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('live_application_queue').select('*')
    
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    
    return Response.json(data || [])
  } catch (err) {
    return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    const supabase = await createClient()
    const { error } = await supabase.from('live_application_queue').delete().eq('id', id)
    
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: 'Failed to delete' }, { status: 500 })
  }
}

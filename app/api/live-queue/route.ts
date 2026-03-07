import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('live_application_queue').select('*')
    
    console.log('Live queue data:', data)
    console.log('Live queue error:', error)
    
    if (error) {
      console.error('Supabase error:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }
    
    return Response.json(data || [])
  } catch (err) {
    console.error('Fetch error:', err)
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

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, live_url, recording_url, status } = body
    const supabase = await createClient()
    
    const updateData: any = {}
    if (live_url !== undefined) updateData.live_url = live_url
    if (recording_url !== undefined) updateData.recording_url = recording_url
    if (status !== undefined) updateData.status = status
    
    const { error } = await supabase
      .from('live_application_queue')
      .update(updateData)
      .eq('id', id)
    
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: 'Failed to update' }, { status: 500 })
  }
}

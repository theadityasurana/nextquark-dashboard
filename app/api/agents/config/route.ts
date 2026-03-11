import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('agent_config')
      .select('*')
      .single()
    
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    
    return Response.json({ config: data })
  } catch (err) {
    console.error('Failed to fetch config:', err)
    return Response.json({ error: 'Failed to fetch config' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = await createClient()
    
    const { data: existingConfig } = await supabase
      .from('agent_config')
      .select('id')
      .single()
    
    if (!existingConfig) {
      return Response.json({ error: 'Config not found' }, { status: 404 })
    }
    
    const { data, error } = await supabase
      .from('agent_config')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingConfig.id)
      .select()
      .single()
    
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }
    
    return Response.json({ config: data })
  } catch (err) {
    console.error('Failed to update config:', err)
    return Response.json({ error: 'Failed to update config' }, { status: 500 })
  }
}

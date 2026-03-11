import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const applicationId = request.nextUrl.searchParams.get('applicationId')
    
    let query = supabase.from('application_logs').select('*').order('timestamp', { ascending: false })
    
    if (applicationId) {
      query = query.eq('application_id', applicationId)
    }
    
    const { data, error } = await query
    
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    // Fetch agent details from live_application_queue
    const uniqueAgentIds = [...new Set(data?.map(log => log.agent_id).filter(Boolean))]
    const agentDetailsMap: Record<string, any> = {}

    if (uniqueAgentIds.length > 0) {
      const { data: agentData } = await supabase
        .from('live_application_queue')
        .select('id, first_name, last_name, job_title, company_name')
        .in('id', uniqueAgentIds)

      agentData?.forEach(agent => {
        agentDetailsMap[agent.id] = {
          firstName: agent.first_name,
          lastName: agent.last_name,
          jobTitle: agent.job_title,
          companyName: agent.company_name
        }
      })
    }
    
    return Response.json({ logs: data || [], agentDetails: agentDetailsMap })
  } catch (err) {
    return Response.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const log = await request.json()
    const supabase = await createClient()
    
    const { error } = await supabase.from('application_logs').insert({
      id: log.id,
      timestamp: new Date().toISOString(),
      level: log.level,
      agent_id: log.agentId,
      message: log.message,
      application_id: log.applicationId
    })
    
    if (error) {
      console.error('Failed to save log:', error)
      return Response.json({ error: error.message }, { status: 500 })
    }
    
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: 'Failed to save log' }, { status: 500 })
  }
}

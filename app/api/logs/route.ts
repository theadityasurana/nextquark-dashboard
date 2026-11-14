import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const applicationId = request.nextUrl.searchParams.get('applicationId')
    
    // ─── Limits ───
    //
    // The dashboard feed is a rolling "what is happening right now" list, so a
    // small newest-first window is right for it. A single application's log is a
    // different thing entirely: it is the record of one run, and 15 lines of it
    // is useless — a normal run emits several hundred, and the interesting ones
    // (the fill plan, the per-field decisions, the audit) are in the middle.
    // Read chronologically and in full.
    const requested = Number(request.nextUrl.searchParams.get('limit'))
    const limit = Number.isFinite(requested) && requested > 0
      ? Math.min(requested, 2000)
      : (applicationId ? 1000 : 15)

    let query = supabase
      .from('application_logs')
      .select('*')
      .order('timestamp', { ascending: !!applicationId })
      .limit(limit)

    if (applicationId) {
      query = query.eq('application_id', applicationId)
    }
    // Incremental reads: only lines newer than the last one the client has.
    const after = request.nextUrl.searchParams.get('after')
    if (after) query = query.gt('timestamp', after)
    
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

/**
 * DELETE /api/logs → removes every row in application_logs (the "Clear all"
 * button). Batched by id so one huge DELETE never holds a long lock or times out.
 */
export async function DELETE() {
  try {
    const supabase = await createClient()
    let removed = 0
    for (let i = 0; i < 2000; i++) {
      const { data, error } = await supabase.from('application_logs').select('id').limit(1000)
      if (error) return Response.json({ error: error.message }, { status: 500 })
      if (!data?.length) break
      const { error: delError } = await supabase.from('application_logs').delete().in('id', data.map((r) => r.id))
      if (delError) return Response.json({ error: delError.message, removed }, { status: 500 })
      removed += data.length
      if (data.length < 1000) break
    }
    return Response.json({ ok: true, removed })
  } catch {
    return Response.json({ error: 'Failed to clear logs' }, { status: 500 })
  }
}

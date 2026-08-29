import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const page   = parseInt(request.nextUrl.searchParams.get('page')  || '1')
    const limit  = parseInt(request.nextUrl.searchParams.get('limit') || '10')
    const status = request.nextUrl.searchParams.get('status')
    const from   = (page - 1) * limit

    // Run all 5 count queries in parallel instead of sequentially
    const [
      { count: totalCount },
      { count: activeCount },
      { count: idleCount },
      { count: completedCount },
      { count: errorCount },
    ] = await Promise.all([
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    ])

    // Paginated agent rows — only the columns the agents screen renders
    const AGENT_COLUMNS = 'id, status, first_name, last_name, email, phone, location, company_name, job_title, job_url, resume_url, created_at, live_url, recording_url, skills, experience, education'

    let query = supabase
      .from('live_application_queue')
      .select(AGENT_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      const statusMap: Record<string, string> = {
        active: 'processing', idle: 'pending', completed: 'completed', error: 'failed',
      }
      query = query.eq('status', statusMap[status] || status)
    }

    query = query.range(from, from + limit - 1)

    const { data: agents, error, count: filteredCount } = await query

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const now = new Date()
    const agentData = (agents || []).map(agent => {
      const durationMs = now.getTime() - new Date(agent.created_at).getTime()
      const durationMinutes = Math.floor(durationMs / 60000)
      const durationSeconds = Math.floor((durationMs % 60000) / 1000)
      return {
        id: agent.id,
        status: agent.status,
        firstName: agent.first_name,
        lastName: agent.last_name,
        email: agent.email,
        phone: agent.phone,
        location: agent.location,
        companyName: agent.company_name,
        jobTitle: agent.job_title,
        jobUrl: agent.job_url,
        resumeUrl: agent.resume_url,
        createdAt: agent.created_at,
        duration: `${durationMinutes}m ${durationSeconds}s`,
        durationMs,
        skills: agent.skills,
        experience: agent.experience,
        education: agent.education,
        liveUrl: agent.live_url || null,
        recordingUrl: agent.recording_url,
      }
    })

    const totalProcessed = (completedCount || 0) + (errorCount || 0)
    const successRate = totalProcessed > 0
      ? (((completedCount || 0) / totalProcessed) * 100).toFixed(1)
      : '0.0'

    return Response.json({
      agents: agentData,
      stats: {
        total: totalCount || 0,
        active: activeCount || 0,
        idle: idleCount || 0,
        completed: completedCount || 0,
        error: errorCount || 0,
        successRate,
        avgProcessingTime: '-',
      },
      pagination: {
        page,
        limit,
        total: filteredCount || 0,
        totalPages: Math.ceil((filteredCount || 0) / limit),
      },
    })
  } catch (err) {
    console.error('Failed to fetch agents:', err)
    return Response.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }
}

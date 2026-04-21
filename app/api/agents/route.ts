import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10')
    const status = request.nextUrl.searchParams.get('status')
    const from = (page - 1) * limit

    // Get total counts for stats (lightweight, head-only queries)
    const { count: totalCount } = await supabase
      .from('live_application_queue')
      .select('*', { count: 'exact', head: true })
    const { count: activeCount } = await supabase
      .from('live_application_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing')
    const { count: idleCount } = await supabase
      .from('live_application_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    const { count: completedCount } = await supabase
      .from('live_application_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
    const { count: errorCount } = await supabase
      .from('live_application_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')

    // Paginated query for agent data
    let query = supabase
      .from('live_application_queue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      const statusMap: Record<string, string> = { active: 'processing', idle: 'pending', completed: 'completed', error: 'failed' }
      query = query.eq('status', statusMap[status] || status)
    }

    query = query.range(from, from + limit - 1)

    const { data: agents, error, count: filteredCount } = await query
    
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const agentData = agents?.map(agent => {
      const createdAt = new Date(agent.created_at)
      const now = new Date()
      const durationMs = now.getTime() - createdAt.getTime()
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
    }) || []

    const totalProcessed = (completedCount || 0) + (errorCount || 0)
    const successRate = totalProcessed > 0 ? (((completedCount || 0) / totalProcessed) * 100).toFixed(1) : '0.0'

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
      }
    })
  } catch (err) {
    console.error('Failed to fetch agents:', err)
    return Response.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }
}

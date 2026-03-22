import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: agents, error } = await supabase
      .from('live_application_queue')
      .select('*')
      .order('created_at', { ascending: false })
    
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

    const totalAgents = agentData.length
    const activeCount = agentData.filter(a => a.status === 'processing').length
    const idleCount = agentData.filter(a => a.status === 'pending').length
    const completedCount = agentData.filter(a => a.status === 'completed').length
    const errorCount = agentData.filter(a => a.status === 'failed').length

    const totalProcessed = completedCount + errorCount
    const successRate = totalProcessed > 0 ? ((completedCount / totalProcessed) * 100).toFixed(1) : '0.0'

    const completedAgents = agentData.filter(a => a.status === 'completed')
    const avgProcessingTime = completedAgents.length > 0
      ? Math.floor(completedAgents.reduce((sum, a) => sum + a.durationMs, 0) / completedAgents.length / 60000)
      : 0

    return Response.json({
      agents: agentData,
      stats: {
        total: totalAgents,
        active: activeCount,
        idle: idleCount,
        completed: completedCount,
        error: errorCount,
        successRate,
        avgProcessingTime: `${avgProcessingTime}m`,
      }
    })
  } catch (err) {
    console.error('Failed to fetch agents:', err)
    return Response.json({ error: 'Failed to fetch agents' }, { status: 500 })
  }
}

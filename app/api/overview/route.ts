import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function getTimeRange(range: string) {
  const now = new Date()
  switch (range) {
    case '1h': return new Date(now.getTime() - 60 * 60 * 1000)
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    default: return new Date(now.getTime() - 24 * 60 * 60 * 1000)
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const chartRange = searchParams.get('chartRange') || '24h'
    const companyRange = searchParams.get('companyRange') || '24h'
    const agentRange = searchParams.get('agentRange') || '24h'
    const jobRange = searchParams.get('jobRange') || '7d'
    
    const supabase = await createClient()
    const today = new Date().toISOString().split('T')[0]

    // Get total jobs count
    const { count: totalJobsCount } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })

    // Single query for all application data
    const { data: allApps } = await supabase
      .from('live_application_queue')
      .select('*')

    // Filter in JS instead of separate DB queries
    const todayApps = allApps?.filter(a => a.created_at >= today) || []

    const chartStartTime = getTimeRange(chartRange)
    const chartData = allApps?.filter(a => a.created_at >= chartStartTime.toISOString()) || []

    // Get logs
    const { data: logs } = await supabase
      .from('application_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(15)

    // Calculate stats
    const totalAll = allApps?.length || 0
    const totalToday = todayApps?.length || 0
    const activeNow = allApps?.filter(a => a.status === 'processing').length || 0
    const completedAll = allApps?.filter(a => a.status === 'completed').length || 0
    const completedToday = todayApps?.filter(a => a.status === 'completed').length || 0
    const failedAll = allApps?.filter(a => a.status === 'failed').length || 0
    const failedToday = todayApps?.filter(a => a.status === 'failed').length || 0
    const successRate = totalAll > 0 ? ((completedAll / totalAll) * 100).toFixed(1) : '0.0'

    // Recent applications
    const recentApps = allApps
      ?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(app => ({
        id: app.id,
        userName: `${app.first_name} ${app.last_name}`,
        userEmail: app.email,
        companyName: app.company_name || 'Unknown',
        jobTitle: app.job_title || 'Unknown Position',
        status: app.status,
        createdAt: new Date(app.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        startedAt: app.started_at ? new Date(app.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'
      })) || []

    // Applications chart based on range
    let applicationsChart: any[] = []
    if (chartRange === '1h' || chartRange === '24h') {
      const hourlyMap = new Map<number, number>()
      chartData?.forEach(app => {
        const hour = new Date(app.created_at).getHours()
        hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1)
      })
      const currentHour = new Date().getHours()
      const hours = chartRange === '1h' ? 6 : 10
      applicationsChart = Array.from({ length: hours }, (_, i) => {
        const hour = (currentHour - hours + 1 + i + 24) % 24
        const displayHour = hour === 0 ? '12am' : hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`
        return { time: displayHour, count: hourlyMap.get(hour) || 0 }
      })
    } else if (chartRange === '7d') {
      const dailyMap = new Map<string, number>()
      chartData?.forEach(app => {
        const day = new Date(app.created_at).toLocaleDateString('en-US', { weekday: 'short' })
        dailyMap.set(day, (dailyMap.get(day) || 0) + 1)
      })
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const today = new Date().getDay()
      applicationsChart = Array.from({ length: 7 }, (_, i) => {
        const dayIndex = (today - 6 + i + 7) % 7
        const day = days[dayIndex]
        return { time: day, count: dailyMap.get(day) || 0 }
      })
    } else if (chartRange === '30d') {
      const dailyMap = new Map<string, number>()
      chartData?.forEach(app => {
        const date = new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        dailyMap.set(date, (dailyMap.get(date) || 0) + 1)
      })
      applicationsChart = Array.from(dailyMap.entries()).map(([time, count]) => ({ time, count }))
    }

    // Top companies based on range — filter from already-fetched data
    const companyStartTime = getTimeRange(companyRange)
    const companyApps = allApps?.filter(a => a.created_at >= companyStartTime.toISOString()) || []
    
    const companyMap = new Map<string, { count: number; completed: number }>()
    companyApps?.forEach(app => {
      const company = app.company_name || 'Unknown'
      const current = companyMap.get(company) || { count: 0, completed: 0 }
      current.count++
      if (app.status === 'completed') current.completed++
      companyMap.set(company, current)
    })

    const topCompanies = Array.from(companyMap.entries())
      .map(([name, data]) => ({
        name,
        appsToday: data.count,
        successRate: data.count > 0 ? ((data.completed / data.count) * 100).toFixed(1) : '0.0',
        logoInitial: name.charAt(0).toUpperCase()
      }))
      .sort((a, b) => b.appsToday - a.appsToday)
      .slice(0, 5)

    // Agent status based on range — filter from already-fetched data
    const agentStartTime = getTimeRange(agentRange)
    const agentApps = allApps?.filter(a => a.created_at >= agentStartTime.toISOString()) || []
    
    const processingApps = agentApps?.filter(a => a.status === 'processing') || []
    const completedApps = agentApps?.filter(a => a.status === 'completed') || []
    const agents = processingApps.map((app, i) => ({
      id: `Agent-${String(i + 1).padStart(2, '0')}`,
      status: 'active' as const,
      currentJob: `${app.company_name} - ${app.job_title}`,
      currentUser: `${app.first_name} ${app.last_name?.charAt(0)}.`,
      currentAppId: app.id,
      startedAt: app.started_at
    }))

    completedApps.slice(0, Math.max(0, 10 - agents.length)).forEach((app, i) => {
      agents.push({
        id: `Agent-${String(agents.length + 1).padStart(2, '0')}`,
        status: 'idle' as const,
        currentJob: `Last: ${app.company_name} - ${app.job_title}`,
        currentUser: null,
        currentAppId: null,
        startedAt: null
      })
    })

    const idleCount = Math.max(0, 10 - agents.length)
    for (let i = 0; i < idleCount; i++) {
      agents.push({
        id: `Agent-${String(agents.length + 1).padStart(2, '0')}`,
        status: 'idle' as const,
        currentJob: null,
        currentUser: null,
        currentAppId: null,
        startedAt: null
      })
    }

    // Portal health
    const { data: portalMetrics } = await supabase
      .from('portal_metrics')
      .select('portal_type, status, response_time_ms')
      .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    
    const portalMap = new Map<string, { total: number; failures: number; totalTime: number }>()
    portalMetrics?.forEach(m => {
      const current = portalMap.get(m.portal_type) || { total: 0, failures: 0, totalTime: 0 }
      current.total++
      if (m.status === 'failure') current.failures++
      current.totalTime += m.response_time_ms || 0
      portalMap.set(m.portal_type, current)
    })
    
    const portalHealth = Array.from(portalMap.entries()).map(([type, data]) => ({
      portalType: type,
      avgResponseTime: data.total > 0 ? Math.round(data.totalTime / data.total) : 0,
      failureRate: data.total > 0 ? ((data.failures / data.total) * 100).toFixed(1) : '0.0',
      status: data.failures / data.total > 0.3 ? 'down' : data.totalTime / data.total > 5000 ? 'slow' : 'active'
    }))

    // User activity
    const { data: users } = await supabase
      .from('profiles')
      .select('id, name, email, total_apps, successful_apps')
      .order('total_apps', { ascending: false })
      .limit(5)
    
    const userActivity = users?.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      totalApps: u.total_apps || 0,
      successfulApps: u.successful_apps || 0,
      successRate: u.total_apps > 0 ? ((u.successful_apps / u.total_apps) * 100).toFixed(1) : '0.0',
    })) || []

    // Job insights based on range — filter from already-fetched data
    const jobStartTime = getTimeRange(jobRange)
    const jobApps = allApps?.filter(a => a.created_at >= jobStartTime.toISOString()) || []
    
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id, title, company_name, right_swipes')
    
    const jobMap = new Map<string, { title: string; company: string; count: number; completed: number; rightSwipes: number }>()
    jobApps?.forEach(app => {
      const current = jobMap.get(app.job_id) || { title: app.job_title, company: app.company_name, count: 0, completed: 0, rightSwipes: 0 }
      current.count++
      if (app.status === 'completed') current.completed++
      jobMap.set(app.job_id, current)
    })
    
    jobs?.forEach(job => {
      const current = jobMap.get(job.id)
      if (current) current.rightSwipes = job.right_swipes || 0
    })
    
    const jobInsights = Array.from(jobMap.entries())
      .map(([id, data]) => ({
        jobId: id,
        title: data.title,
        company: data.company,
        applications: data.count,
        rightSwipes: data.rightSwipes,
        successRate: data.count > 0 ? ((data.completed / data.count) * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => b.applications - a.applications)
      .slice(0, 5)

    // Job sync activity from sync queue — needs admin client to bypass RLS
    const adminSupabase = createAdminClient()
    const { data: syncResults } = await adminSupabase
      .from('job_sync_queue')
      .select('company_id, status, synced_at, result')
      .eq('status', 'done')
      .order('synced_at', { ascending: false })
      .limit(200)

    const { data: syncCompanies } = await adminSupabase
      .from('companies')
      .select('id, name, logo_initial')

    const companyNameMap = new Map((syncCompanies || []).map(c => [c.id, { name: c.name, initial: c.logo_initial || c.name?.charAt(0)?.toUpperCase() || '?' }]))

    let totalAdded = 0, totalDeleted = 0, totalUpdated = 0
    const syncByCompany = new Map<string, { name: string; initial: string; added: number; updated: number; deleted: number; syncedAt: string }>()
    const seenCompanyIds = new Set<string>()

    for (const row of syncResults || []) {
      const r = row.result || {}
      const added = r.added || 0
      const updated = r.updated || 0
      const deleted = r.deleted || 0
      totalAdded += added
      totalUpdated += updated
      totalDeleted += deleted
      seenCompanyIds.add(row.company_id)
      const info = companyNameMap.get(row.company_id)
      if (!syncByCompany.has(row.company_id)) {
        syncByCompany.set(row.company_id, {
          name: info?.name || row.company_id,
          initial: info?.initial || '?',
          added, updated, deleted,
          syncedAt: row.synced_at
        })
      }
    }

    const syncActivity = {
      totals: { added: totalAdded, updated: totalUpdated, deleted: totalDeleted, companiesSynced: seenCompanyIds.size },
      byCompany: Array.from(syncByCompany.values()).sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted)).slice(0, 20),
    }

    return Response.json({
      stats: {
        totalAll,
        totalToday,
        activeNow,
        successRate,
        failedAll,
        failedToday,
        completedAll,
        completedToday
      },
      totalJobs: totalJobsCount || 0,
      recentApps,
      applicationsChart,
      topCompanies,
      agents,
      portalHealth,
      userActivity,
      jobInsights,
      syncActivity,
      logs: logs?.map(log => ({
        id: log.id,
        timestamp: new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        level: log.level,
        agentId: log.agent_id || 'System',
        message: log.message,
        applicationId: log.application_id
      })) || []
    })
  } catch (err) {
    console.error('Overview fetch error:', err)
    return Response.json({ error: 'Failed to fetch overview data' }, { status: 500 })
  }
}

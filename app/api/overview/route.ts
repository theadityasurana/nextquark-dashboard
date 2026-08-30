import { createAdminClient } from '@/lib/supabase/admin'
import { unstable_cache } from 'next/cache'

function getTimeRange(range: string): string {
  const now = new Date()
  switch (range) {
    case '1h':  return new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    case '7d':  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    default:    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  }
}

// Aggregate stats are cached for 30 seconds — they don't need to be real-time
// and this eliminates the most expensive repeated queries on every dashboard load.
const getCachedStats = unstable_cache(
  async () => {
    const supabase = createAdminClient()
    const today = new Date().toISOString().split('T')[0]

    const [
      { count: totalAll },
      { count: totalToday },
      { count: activeNow },
      { count: completedAll },
      { count: completedToday },
      { count: failedAll },
      { count: failedToday },
      { count: totalJobs },
    ] = await Promise.all([
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).gte('created_at', today),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('created_at', today),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
      supabase.from('live_application_queue').select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', today),
      supabase.from('jobs').select('*', { count: 'exact', head: true }),
    ])

    const t = totalAll || 0
    const c = completedAll || 0
    return {
      totalAll: t,
      totalToday: totalToday || 0,
      activeNow: activeNow || 0,
      completedAll: c,
      completedToday: completedToday || 0,
      failedAll: failedAll || 0,
      failedToday: failedToday || 0,
      successRate: t > 0 ? ((c / t) * 100).toFixed(1) : '0.0',
      totalJobs: totalJobs || 0,
    }
  },
  ['overview-stats'],
  { revalidate: 30 }
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const chartRange   = searchParams.get('chartRange')   || '24h'
    const companyRange = searchParams.get('companyRange') || '24h'
    const agentRange   = searchParams.get('agentRange')   || '24h'
    const jobRange     = searchParams.get('jobRange')     || '7d'

    const supabase = createAdminClient()

    // Run all independent queries in parallel
    const [
      stats,
      { data: recentRaw },
      { data: chartRaw },
      { data: companyRaw },
      { data: agentRaw },
      { data: portalMetrics },
      { data: users },
      { data: jobAppsRaw },
      { data: jobs },
      { data: syncResults },
      { data: syncCompanies },
      { data: logs },
    ] = await Promise.all([
      getCachedStats(),

      // Recent apps — only the columns the UI actually renders
      supabase
        .from('live_application_queue')
        .select('id, first_name, last_name, email, company_name, job_title, status, created_at, started_at')
        .order('created_at', { ascending: false })
        .limit(10),

      // Chart data — only timestamp needed for bucketing
      supabase
        .from('live_application_queue')
        .select('created_at')
        .gte('created_at', getTimeRange(chartRange)),

      // Company breakdown
      supabase
        .from('live_application_queue')
        .select('company_name, status')
        .gte('created_at', getTimeRange(companyRange)),

      // Agent status
      supabase
        .from('live_application_queue')
        .select('id, company_name, job_title, first_name, last_name, status, started_at')
        .gte('created_at', getTimeRange(agentRange))
        .in('status', ['processing', 'completed']),

      // Portal health
      supabase
        .from('portal_metrics')
        .select('portal_type, status, response_time_ms')
        .gte('timestamp', getTimeRange('24h')),

      // Top users — kept for potential future use but userActivity is now computed live
      supabase
        .from('profiles')
        .select('id, name, email, total_apps, successful_apps')
        .order('total_apps', { ascending: false })
        .limit(5),

      // Job insights — only what's needed for the map
      supabase
        .from('live_application_queue')
        .select('job_id, job_title, company_name, status')
        .gte('created_at', getTimeRange(jobRange)),

      // Right-swipe counts for job insights
      supabase
        .from('jobs')
        .select('id, right_swipes'),

      // Sync results
      supabase
        .from('job_sync_queue')
        .select('company_id, synced_at, result')
        .eq('status', 'done')
        .order('synced_at', { ascending: false })
        .limit(200),

      // Company names for sync activity
      supabase
        .from('companies')
        .select('id, name, logo_initial'),

      // Recent logs
      supabase
        .from('application_logs')
        .select('id, timestamp, level, agent_id, message, application_id')
        .order('timestamp', { ascending: false })
        .limit(15),
    ])

    // ── Recent apps ──
    const recentApps = (recentRaw || []).map(app => ({
      id: app.id,
      userName: `${app.first_name} ${app.last_name}`,
      userEmail: app.email,
      companyName: app.company_name || 'Unknown',
      jobTitle: app.job_title || 'Unknown Position',
      status: app.status,
      createdAt: new Date(app.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      startedAt: app.started_at ? new Date(app.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-',
    }))

    // ── Applications chart ──
    let applicationsChart: { time: string; count: number }[] = []
    if (chartRange === '1h' || chartRange === '24h') {
      const hourlyMap = new Map<number, number>()
      ;(chartRaw || []).forEach(app => {
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
      ;(chartRaw || []).forEach(app => {
        const day = new Date(app.created_at).toLocaleDateString('en-US', { weekday: 'short' })
        dailyMap.set(day, (dailyMap.get(day) || 0) + 1)
      })
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const todayIdx = new Date().getDay()
      applicationsChart = Array.from({ length: 7 }, (_, i) => {
        const day = days[(todayIdx - 6 + i + 7) % 7]
        return { time: day, count: dailyMap.get(day) || 0 }
      })
    } else {
      const dailyMap = new Map<string, number>()
      ;(chartRaw || []).forEach(app => {
        const date = new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        dailyMap.set(date, (dailyMap.get(date) || 0) + 1)
      })
      applicationsChart = Array.from(dailyMap.entries()).map(([time, count]) => ({ time, count }))
    }

    // ── Top companies ──
    const companyMap = new Map<string, { count: number; completed: number }>()
    ;(companyRaw || []).forEach(app => {
      const company = app.company_name || 'Unknown'
      const cur = companyMap.get(company) || { count: 0, completed: 0 }
      cur.count++
      if (app.status === 'completed') cur.completed++
      companyMap.set(company, cur)
    })
    const topCompanies = Array.from(companyMap.entries())
      .map(([name, d]) => ({
        name,
        appsToday: d.count,
        successRate: d.count > 0 ? ((d.completed / d.count) * 100).toFixed(1) : '0.0',
        logoInitial: name.charAt(0).toUpperCase(),
      }))
      .sort((a, b) => b.appsToday - a.appsToday)
      .slice(0, 5)

    // ── Agent status ──
    const processingApps = (agentRaw || []).filter(a => a.status === 'processing')
    const completedApps  = (agentRaw || []).filter(a => a.status === 'completed')
    const agents: any[] = processingApps.map((app, i) => ({
      id: `Agent-${String(i + 1).padStart(2, '0')}`,
      status: 'active',
      currentJob: `${app.company_name} - ${app.job_title}`,
      currentUser: `${app.first_name} ${app.last_name?.charAt(0)}.`,
      currentAppId: app.id,
      startedAt: app.started_at,
    }))
    completedApps.slice(0, Math.max(0, 10 - agents.length)).forEach(() => {
      agents.push({ id: `Agent-${String(agents.length + 1).padStart(2, '0')}`, status: 'idle', currentJob: null, currentUser: null, currentAppId: null, startedAt: null })
    })
    for (let i = agents.length; i < 10; i++) {
      agents.push({ id: `Agent-${String(i + 1).padStart(2, '0')}`, status: 'idle', currentJob: null, currentUser: null, currentAppId: null, startedAt: null })
    }

    // ── Portal health ──
    // Primary: portal_metrics table (written by kernel.ts after each run)
    // Fallback: derive from live_application_queue.portal_type when metrics table is empty
    const portalMap = new Map<string, { total: number; failures: number; totalTime: number }>()
    ;(portalMetrics || []).forEach(m => {
      const cur = portalMap.get(m.portal_type) || { total: 0, failures: 0, totalTime: 0 }
      cur.total++
      if (m.status === 'failure') cur.failures++
      cur.totalTime += m.response_time_ms || 0
      portalMap.set(m.portal_type, cur)
    })

    let portalHealth: any[]
    if (portalMap.size > 0) {
      portalHealth = Array.from(portalMap.entries()).map(([type, d]) => ({
        portalType: type,
        avgResponseTime: d.total > 0 ? Math.round(d.totalTime / d.total) : 0,
        failureRate: d.total > 0 ? ((d.failures / d.total) * 100).toFixed(1) : '0.0',
        status: d.failures / d.total > 0.3 ? 'down' : d.totalTime / d.total > 5000 ? 'slow' : 'active',
      }))
    } else {
      // Fallback: derive from completed/failed queue rows that have portal_type set
      const { data: portalRows } = await supabase
        .from('live_application_queue')
        .select('portal_type, status, processing_time_ms')
        .not('portal_type', 'is', null)
        .gte('created_at', getTimeRange('7d'))
      const fallbackMap = new Map<string, { total: number; failures: number; totalTime: number }>()
      ;(portalRows || []).forEach((r: any) => {
        if (!r.portal_type) return
        const cur = fallbackMap.get(r.portal_type) || { total: 0, failures: 0, totalTime: 0 }
        cur.total++
        if (r.status === 'failed') cur.failures++
        cur.totalTime += r.processing_time_ms || 0
        fallbackMap.set(r.portal_type, cur)
      })
      portalHealth = Array.from(fallbackMap.entries()).map(([type, d]) => ({
        portalType: type,
        avgResponseTime: d.total > 0 ? Math.round(d.totalTime / d.total) : 0,
        failureRate: d.total > 0 ? ((d.failures / d.total) * 100).toFixed(1) : '0.0',
        status: d.failures / d.total > 0.3 ? 'down' : d.totalTime / d.total > 5000 ? 'slow' : 'active',
      }))
    }

    // ── User activity ──
    // Compute live from the queue so it works even if the profile trigger hasn't run
    const { data: userQueueRows } = await supabase
      .from('live_application_queue')
      .select('user_id, first_name, last_name, email, status')
      .limit(5000)
    const userMap = new Map<string, { name: string; email: string; total: number; completed: number }>()
    ;(userQueueRows || []).forEach((r: any) => {
      const cur = userMap.get(r.user_id) || { name: `${r.first_name} ${r.last_name}`, email: r.email || '', total: 0, completed: 0 }
      cur.total++
      if (r.status === 'completed') cur.completed++
      userMap.set(r.user_id, cur)
    })
    const userActivity = Array.from(userMap.entries())
      .map(([id, d]) => ({
        id,
        name: d.name,
        email: d.email,
        totalApps: d.total,
        successfulApps: d.completed,
        successRate: d.total > 0 ? ((d.completed / d.total) * 100).toFixed(1) : '0.0',
      }))
      .sort((a, b) => b.totalApps - a.totalApps)
      .slice(0, 5)

    // ── Job insights ──
    const rightSwipeMap = new Map((jobs || []).map(j => [j.id, j.right_swipes || 0]))
    const jobMap = new Map<string, { title: string; company: string; count: number; completed: number }>()
    ;(jobAppsRaw || []).forEach(app => {
      const cur = jobMap.get(app.job_id) || { title: app.job_title, company: app.company_name, count: 0, completed: 0 }
      cur.count++
      if (app.status === 'completed') cur.completed++
      jobMap.set(app.job_id, cur)
    })
    const jobInsights = Array.from(jobMap.entries())
      .map(([id, d]) => ({
        jobId: id,
        title: d.title,
        company: d.company,
        applications: d.count,
        rightSwipes: rightSwipeMap.get(id) || 0,
        successRate: d.count > 0 ? ((d.completed / d.count) * 100).toFixed(1) : '0.0',
      }))
      .sort((a, b) => b.applications - a.applications)
      .slice(0, 5)

    // ── Sync activity ──
    const companyNameMap = new Map((syncCompanies || []).map(c => [c.id, { name: c.name, initial: c.logo_initial || c.name?.charAt(0)?.toUpperCase() || '?' }]))
    let totalAdded = 0, totalDeleted = 0, totalUpdated = 0
    const syncByCompany = new Map<string, { name: string; initial: string; added: number; updated: number; deleted: number; syncedAt: string }>()
    const seenCompanyIds = new Set<string>()
    for (const row of syncResults || []) {
      const r = row.result || {}
      totalAdded   += r.added   || 0
      totalUpdated += r.updated || 0
      totalDeleted += r.deleted || 0
      seenCompanyIds.add(row.company_id)
      if (!syncByCompany.has(row.company_id)) {
        const info = companyNameMap.get(row.company_id)
        syncByCompany.set(row.company_id, {
          name: info?.name || row.company_id,
          initial: info?.initial || '?',
          added: r.added || 0, updated: r.updated || 0, deleted: r.deleted || 0,
          syncedAt: row.synced_at,
        })
      }
    }

    return Response.json({
      stats,
      totalJobs: stats.totalJobs,
      recentApps,
      applicationsChart,
      topCompanies,
      agents,
      portalHealth,
      userActivity,
      jobInsights,
      syncActivity: {
        totals: { added: totalAdded, updated: totalUpdated, deleted: totalDeleted, companiesSynced: seenCompanyIds.size },
        byCompany: Array.from(syncByCompany.values()).sort((a, b) => (b.added + b.deleted) - (a.added + a.deleted)).slice(0, 20),
      },
      logs: (logs || []).map(log => ({
        id: log.id,
        timestamp: new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        level: log.level,
        agentId: log.agent_id || 'System',
        message: log.message,
        applicationId: log.application_id,
      })),
    })
  } catch (err) {
    console.error('Overview fetch error:', err)
    return Response.json({ error: 'Failed to fetch overview data' }, { status: 500 })
  }
}

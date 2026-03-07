import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const timeRange = request.nextUrl.searchParams.get('range') || '7'
    
    const daysAgo = new Date()
    daysAgo.setDate(daysAgo.getDate() - parseInt(timeRange))
    
    // Get applications data
    const { data: applications, error } = await supabase
      .from('live_application_queue')
      .select('*')
      .gte('created_at', daysAgo.toISOString())
      .order('created_at', { ascending: true })
    
    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    // Calculate success rate trends
    const successRateTrends = calculateSuccessRateTrends(applications || [])
    
    // Calculate processing time by portal
    const processingTimeByPortal = calculateProcessingTimeByPortal(applications || [])
    
    // Calculate error analysis
    const errorAnalysis = calculateErrorAnalysis(applications || [])
    
    // Calculate throughput
    const throughput = calculateThroughput(applications || [])
    
    // Calculate portal performance
    const portalPerformance = calculatePortalPerformance(applications || [])
    
    // Calculate company performance
    const companyPerformance = calculateCompanyPerformance(applications || [])
    
    // Calculate time of day analysis
    const timeOfDayAnalysis = calculateTimeOfDayAnalysis(applications || [])
    
    // Calculate agent utilization
    const agentUtilization = calculateAgentUtilization(applications || [])

    return Response.json({
      successRateTrends,
      processingTimeByPortal,
      errorAnalysis,
      throughput,
      portalPerformance,
      companyPerformance,
      timeOfDayAnalysis,
      agentUtilization,
      totalApplications: applications?.length || 0,
      successfulApplications: applications?.filter(a => a.status === 'completed').length || 0,
      failedApplications: applications?.filter(a => a.status === 'failed').length || 0,
    })
  } catch (err) {
    console.error('Failed to fetch performance metrics:', err)
    return Response.json({ error: 'Failed to fetch performance metrics' }, { status: 500 })
  }
}

function calculateSuccessRateTrends(applications: any[]) {
  const dailyStats: Record<string, { total: number; successful: number }> = {}
  
  applications.forEach(app => {
    const date = new Date(app.created_at).toISOString().split('T')[0]
    if (!dailyStats[date]) {
      dailyStats[date] = { total: 0, successful: 0 }
    }
    dailyStats[date].total++
    if (app.status === 'completed') {
      dailyStats[date].successful++
    }
  })
  
  return Object.entries(dailyStats).map(([date, stats]) => ({
    date,
    successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
    total: stats.total,
    successful: stats.successful
  }))
}

function calculateProcessingTimeByPortal(applications: any[]) {
  const portalStats: Record<string, { totalTime: number; count: number }> = {}
  
  applications.forEach(app => {
    if (app.status === 'completed') {
      const portal = detectPortalType(app.job_url)
      const duration = new Date().getTime() - new Date(app.created_at).getTime()
      
      if (!portalStats[portal]) {
        portalStats[portal] = { totalTime: 0, count: 0 }
      }
      portalStats[portal].totalTime += duration
      portalStats[portal].count++
    }
  })
  
  return Object.entries(portalStats).map(([portal, stats]) => ({
    portal,
    avgTime: stats.count > 0 ? Math.floor(stats.totalTime / stats.count / 60000) : 0,
    count: stats.count
  }))
}

function calculateErrorAnalysis(applications: any[]) {
  const errorReasons: Record<string, number> = {
    'Timeout': 0,
    'Form Error': 0,
    'Portal Down': 0,
    'Auth Failed': 0,
    'Other': 0
  }
  
  applications.forEach(app => {
    if (app.status === 'failed') {
      errorReasons['Other']++
    }
  })
  
  const total = Object.values(errorReasons).reduce((sum, count) => sum + count, 0)
  
  return Object.entries(errorReasons).map(([reason, count]) => ({
    reason,
    count,
    percentage: total > 0 ? (count / total) * 100 : 0
  }))
}

function calculateThroughput(applications: any[]) {
  const hourlyStats: Record<number, number> = {}
  
  applications.forEach(app => {
    const hour = new Date(app.created_at).getHours()
    hourlyStats[hour] = (hourlyStats[hour] || 0) + 1
  })
  
  return Array.from({ length: 24 }, (_, hour) => ({
    hour: `${hour}:00`,
    count: hourlyStats[hour] || 0
  }))
}

function calculatePortalPerformance(applications: any[]) {
  const portalStats: Record<string, { total: number; successful: number; avgTime: number }> = {}
  
  applications.forEach(app => {
    const portal = detectPortalType(app.job_url)
    if (!portalStats[portal]) {
      portalStats[portal] = { total: 0, successful: 0, avgTime: 0 }
    }
    portalStats[portal].total++
    if (app.status === 'completed') {
      portalStats[portal].successful++
    }
  })
  
  return Object.entries(portalStats).map(([portal, stats]) => ({
    portal,
    successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
    total: stats.total
  }))
}

function calculateCompanyPerformance(applications: any[]) {
  const companyStats: Record<string, { total: number; successful: number }> = {}
  
  applications.forEach(app => {
    const company = app.company_name
    if (!companyStats[company]) {
      companyStats[company] = { total: 0, successful: 0 }
    }
    companyStats[company].total++
    if (app.status === 'completed') {
      companyStats[company].successful++
    }
  })
  
  return Object.entries(companyStats)
    .map(([company, stats]) => ({
      company,
      successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
      total: stats.total
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
}

function calculateTimeOfDayAnalysis(applications: any[]) {
  const hourlyStats: Record<number, { total: number; successful: number }> = {}
  
  applications.forEach(app => {
    const hour = new Date(app.created_at).getHours()
    if (!hourlyStats[hour]) {
      hourlyStats[hour] = { total: 0, successful: 0 }
    }
    hourlyStats[hour].total++
    if (app.status === 'completed') {
      hourlyStats[hour].successful++
    }
  })
  
  return Object.entries(hourlyStats).map(([hour, stats]) => ({
    hour: `${hour}:00`,
    successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
    total: stats.total
  }))
}

function calculateAgentUtilization(applications: any[]) {
  const statusCounts = {
    processing: applications.filter(a => a.status === 'processing').length,
    pending: applications.filter(a => a.status === 'pending').length,
    completed: applications.filter(a => a.status === 'completed').length,
    failed: applications.filter(a => a.status === 'failed').length,
  }
  
  const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0)
  
  return {
    active: statusCounts.processing,
    idle: statusCounts.pending,
    utilization: total > 0 ? (statusCounts.processing / total) * 100 : 0
  }
}

function detectPortalType(url: string): string {
  if (!url) return 'Unknown'
  if (url.includes('workday')) return 'Workday'
  if (url.includes('greenhouse')) return 'Greenhouse'
  if (url.includes('lever')) return 'Lever'
  if (url.includes('applytojob')) return 'ApplyToJob'
  if (url.includes('myworkdayjobs')) return 'Workday'
  return 'Custom'
}

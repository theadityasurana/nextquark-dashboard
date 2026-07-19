"use client"

import { useState, useMemo, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useData } from "@/lib/data-context"
import {
  Download, TrendingUp, TrendingDown, Building2, Briefcase, Users, MousePointerClick,
  ArrowUpDown, ArrowUp, ArrowDown, Filter, RefreshCw
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts"

type SortField = "title" | "applications" | "rightSwipes" | "successRate"
type SortDirection = "asc" | "desc"
type MetricView = "all" | "jobs" | "applications" | "rightSwipes"

interface AnalyticsJob {
  id: string
  companyId: string
  companyName: string
  companyInitial: string
  title: string
  location: string
  rightSwipes: number
  successRate: number
  totalApps: number
  createdAt: string
}

interface AnalyticsApp {
  id: string
  jobId: string
  companyId: string
  status: string
  createdAt: string
}

export function AnalyticsScreen() {
  const { companies } = useData()
  const [jobs, setJobs] = useState<AnalyticsJob[]>([])
  const [applications, setApplications] = useState<AnalyticsApp[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all")
  const [sortField, setSortField] = useState<SortField>("rightSwipes")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [metricView, setMetricView] = useState<MetricView>("all")
  const [jobsTablePage, setJobsTablePage] = useState(1)
  const [companySwipesPage, setCompanySwipesPage] = useState(1)
  const [companyJobsPage, setCompanyJobsPage] = useState(1)
  const ANALYTICS_PER_PAGE = 10

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics')
      const data = await res.json()
      if (data.jobs) {
        setJobs(data.jobs.map((j: any) => ({
          id: j.id,
          companyId: j.company_id,
          companyName: j.company_name,
          companyInitial: j.company_initial || j.company_name?.charAt(0) || '',
          title: j.title,
          location: j.location,
          rightSwipes: j.right_swipes || 0,
          successRate: j.success_rate || 0,
          totalApps: j.total_apps || 0,
          createdAt: j.created_at,
        })))
      }
      if (data.applications) {
        setApplications(data.applications.map((a: any) => ({
          id: a.id,
          jobId: a.job_id,
          companyId: a.company_id,
          status: a.status,
          createdAt: a.created_at,
        })))
      }
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchAnalytics()
    setRefreshing(false)
  }

  // Filtered data based on selected company
  const filteredJobs = useMemo(() => {
    if (selectedCompanyId === "all") return jobs
    return jobs.filter((job) => job.companyId === selectedCompanyId)
  }, [selectedCompanyId, jobs])

  const filteredApplications = useMemo(() => {
    if (selectedCompanyId === "all") return applications
    return applications.filter((app) => app.companyId === selectedCompanyId)
  }, [selectedCompanyId, applications])

  // Sorted jobs for the table (descending by default)
  const sortedJobs = useMemo(() => {
    return [...filteredJobs].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case "title":
          comparison = a.title.localeCompare(b.title)
          break
        case "applications":
          comparison = a.totalApps - b.totalApps
          break
        case "rightSwipes":
          comparison = (a.rightSwipes ?? 0) - (b.rightSwipes ?? 0)
          break
        case "successRate":
          comparison = a.successRate - b.successRate
          break
      }
      return sortDirection === "asc" ? comparison : -comparison
    })
  }, [filteredJobs, sortField, sortDirection])

  // Paginated jobs for the table
  const totalJobsTablePages = Math.ceil(sortedJobs.length / ANALYTICS_PER_PAGE)
  const paginatedSortedJobs = sortedJobs.slice(
    (jobsTablePage - 1) * ANALYTICS_PER_PAGE,
    jobsTablePage * ANALYTICS_PER_PAGE
  )

  // Summary statistics
  const totalJobsListed = filteredJobs.length
  const totalApplications = filteredApplications.length
  const totalRightSwipesFiltered = filteredJobs.reduce((sum, job) => sum + (job.rightSwipes ?? 0), 0)
  const totalRightSwipesAll = jobs.reduce((sum, job) => sum + (job.rightSwipes ?? 0), 0)
  const avgSuccessRate = filteredJobs.length > 0
    ? (filteredJobs.reduce((sum, job) => sum + job.successRate, 0) / filteredJobs.length).toFixed(1)
    : "0"

  // Per-company breakdown for the overview chart (sorted descending by rightSwipes)
  const companyBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; jobs: number; applications: number; rightSwipes: number }>()
    companies.forEach((c) => {
      const companyJobs = jobs.filter((j) => j.companyId === c.id)
      const companyApps = applications.filter((a) => a.companyId === c.id)
      if (companyJobs.length > 0) {
        map.set(c.id, {
          name: c.name,
          jobs: companyJobs.length,
          applications: companyApps.length,
          rightSwipes: companyJobs.reduce((sum, j) => sum + (j.rightSwipes ?? 0), 0),
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => b.rightSwipes - a.rightSwipes)
  }, [companies, jobs, applications])

  // Paginated company breakdowns
  const totalCompanySwipesPages = Math.ceil(companyBreakdown.length / ANALYTICS_PER_PAGE)
  const paginatedCompanySwipes = companyBreakdown.slice(
    (companySwipesPage - 1) * ANALYTICS_PER_PAGE,
    companySwipesPage * ANALYTICS_PER_PAGE
  )
  const totalCompanyJobsPages = Math.ceil(companyBreakdown.length / ANALYTICS_PER_PAGE)
  const paginatedCompanyJobs = companyBreakdown.slice(
    (companyJobsPage - 1) * ANALYTICS_PER_PAGE,
    companyJobsPage * ANALYTICS_PER_PAGE
  )

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId)

  // Compute "Right Swipes Over the Week" from real job timestamps
  const rightSwipesOverWeek = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    const counts = new Array(7).fill(0)
    
    filteredJobs.forEach(job => {
      if (job.createdAt) {
        const date = new Date(job.createdAt)
        const dayIndex = (date.getDay() + 6) % 7 // Convert Sunday=0 to Monday=0
        counts[dayIndex] += job.rightSwipes || 0
      }
    })
    
    return days.map((day, i) => ({ day, count: counts[i] }))
  }, [filteredJobs])

  // Compute "Peak Hours" from real application timestamps
  const peakHoursData = useMemo(() => {
    const hours = ["6am", "7am", "8am", "9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm"]
    const counts = new Array(12).fill(0)
    
    filteredApplications.forEach(app => {
      if (app.createdAt) {
        const date = new Date(app.createdAt)
        const hour = date.getHours()
        if (hour >= 6 && hour <= 17) {
          counts[hour - 6]++
        }
      }
    })
    
    return hours.map((hour, i) => ({ hour, count: counts[i] }))
  }, [filteredApplications])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
    setJobsTablePage(1)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
  }

  const barColors = ["oklch(0.7 0.18 270)", "oklch(0.7 0.16 220)", "oklch(0.78 0.16 70)", "oklch(0.65 0.22 0)", "oklch(0.72 0.18 320)", "oklch(0.72 0.18 155)"]

  if (loading) {
    return <div className="flex items-center justify-center h-96">Loading analytics...</div>
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Detailed analytics and reporting across companies and jobs</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
            <Download className="h-3 w-3" /> Export
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
            </div>

            {/* Company Selector */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Company</span>
              <Select value={selectedCompanyId} onValueChange={(v) => { setSelectedCompanyId(v); setJobsTablePage(1); setCompanySwipesPage(1); setCompanyJobsPage(1) }}>
                <SelectTrigger className="w-[200px] bg-accent/30 border-border h-9 text-xs">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      All Companies
                    </span>
                  </SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      <span className="flex items-center gap-2">
                        <span className="flex h-4 w-4 items-center justify-center rounded bg-accent text-[8px] font-bold text-accent-foreground shrink-0">
                          {company.logoInitial}
                        </span>
                        {company.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Metric View */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">View</span>
              <Select value={metricView} onValueChange={(v) => setMetricView(v as MetricView)}>
                <SelectTrigger className="w-[180px] bg-accent/30 border-border h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="all">All Metrics</SelectItem>
                  <SelectItem value="jobs">Jobs Overview</SelectItem>
                  <SelectItem value="applications">Applications</SelectItem>
                  <SelectItem value="rightSwipes">Right Swipes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedCompanyId !== "all" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-muted-foreground hover:text-foreground ml-auto"
                onClick={() => setSelectedCompanyId("all")}
              >
                Clear Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Jobs Listed</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{totalJobsListed}</span>
            {selectedCompanyId !== "all" && (
              <p className="text-[11px] text-muted-foreground mt-1">for {selectedCompany?.name}</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Applications</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{totalApplications}</span>
            {selectedCompanyId !== "all" && (
              <p className="text-[11px] text-muted-foreground mt-1">for {selectedCompany?.name}</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                {selectedCompanyId === "all" ? "Total Right Swipes" : "Right Swipes"}
              </span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{totalRightSwipesFiltered.toLocaleString()}</span>
            {selectedCompanyId !== "all" && (
              <p className="text-[11px] text-muted-foreground mt-1">for {selectedCompany?.name}</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Avg Success Rate</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{avgSuccessRate}%</span>
            {selectedCompanyId !== "all" && (
              <p className="text-[11px] text-muted-foreground mt-1">for {selectedCompany?.name}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Global Stat: Total Right Swipes Across All */}
      {selectedCompanyId !== "all" && (
        <Card className="bg-accent/30 border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MousePointerClick className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Total Right Swipes (All Companies)</p>
                <p className="text-[11px] text-muted-foreground">Combined across all jobs and all companies</p>
              </div>
            </div>
            <span className="text-2xl font-bold">{totalRightSwipesAll.toLocaleString()}</span>
          </CardContent>
        </Card>
      )}

      {/* Jobs Detail Table - Applications per job & Right swipes per job */}
      {(metricView === "all" || metricView === "applications" || metricView === "rightSwipes") && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {selectedCompanyId === "all" ? "All Jobs" : `${selectedCompany?.name} Jobs`} - Detailed Breakdown
              </CardTitle>
              <Badge variant="secondary" className="bg-secondary text-secondary-foreground text-[10px]">
                {sortedJobs.length} jobs
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Table Header */}
            <div className="hidden sm:grid grid-cols-[1fr_2fr_100px_120px_100px] gap-4 px-4 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-medium">
              <button className="flex items-center gap-1 text-left" onClick={() => handleSort("title")}>
                Company / Job <SortIcon field="title" />
              </button>
              <span>Title</span>
              <button className="flex items-center gap-1 justify-end" onClick={() => handleSort("applications")}>
                Apps <SortIcon field="applications" />
              </button>
              <button className="flex items-center gap-1 justify-end" onClick={() => handleSort("rightSwipes")}>
                Right Swipes <SortIcon field="rightSwipes" />
              </button>
              <button className="flex items-center gap-1 justify-end" onClick={() => handleSort("successRate")}>
                Success <SortIcon field="successRate" />
              </button>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-border max-h-[400px] overflow-auto">
              {paginatedSortedJobs.map((job) => {
                const jobApps = applications.filter((a) => a.jobId === job.id)
                return (
                  <div
                    key={job.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_100px_120px_100px] gap-2 sm:gap-4 px-4 py-3 hover:bg-accent/30 transition-colors items-center"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-accent text-[10px] font-bold text-accent-foreground shrink-0">
                        {job.companyInitial}
                      </div>
                      <span className="text-xs font-medium truncate">{job.companyName}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <p className="text-[10px] text-muted-foreground">{job.location}</p>
                    </div>
                    <div className="flex items-center justify-between sm:block sm:text-right">
                      <span className="text-xs text-muted-foreground sm:hidden">Apps: </span>
                      <span className="text-sm font-bold">{job.totalApps.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between sm:block sm:text-right">
                      <span className="text-xs text-muted-foreground sm:hidden">Right Swipes: </span>
                      <span className="text-sm font-bold text-primary">{(job.rightSwipes ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between sm:block sm:text-right">
                      <span className="text-xs text-muted-foreground sm:hidden">Success: </span>
                      <div>
                        <span className="text-sm font-medium">{job.successRate}%</span>
                        <div className="mt-1 h-1.5 rounded-full bg-accent/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-success/70"
                            style={{ width: `${job.successRate}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {sortedJobs.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No jobs found for the selected company.
                </div>
              )}
            </div>
            {/* Jobs Table Pagination */}
            {totalJobsTablePages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">Showing {((jobsTablePage - 1) * ANALYTICS_PER_PAGE) + 1}-{Math.min(jobsTablePage * ANALYTICS_PER_PAGE, sortedJobs.length)} of {sortedJobs.length}</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="text-xs h-7" disabled={jobsTablePage === 1} onClick={() => setJobsTablePage(p => p - 1)}>Previous</Button>
                  <span className="text-xs text-muted-foreground">Page {jobsTablePage} of {totalJobsTablePages}</span>
                  <Button size="sm" variant="outline" className="text-xs h-7" disabled={jobsTablePage === totalJobsTablePages} onClick={() => setJobsTablePage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Company Breakdown Chart */}
      {(metricView === "all" || metricView === "jobs") && selectedCompanyId === "all" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Right Swipes by Company */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Right Swipes by Company</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {paginatedCompanySwipes.map((entry, i) => {
                  const maxSwipes = companyBreakdown[0]?.rightSwipes || 1
                  const width = (entry.rightSwipes / maxSwipes) * 100
                  const globalIndex = (companySwipesPage - 1) * ANALYTICS_PER_PAGE + i
                  return (
                    <div key={entry.name} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{globalIndex + 1}.</span>
                      <span className="text-sm font-medium w-20 shrink-0 truncate">{entry.name}</span>
                      <div className="flex-1 h-5 rounded-full bg-accent/50 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${width}%`, backgroundColor: barColors[globalIndex % barColors.length] }}
                        />
                      </div>
                      <span className="text-sm font-medium w-16 text-right shrink-0">{entry.rightSwipes.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
              {totalCompanySwipesPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">{companyBreakdown.length} companies</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs h-6" disabled={companySwipesPage === 1} onClick={() => setCompanySwipesPage(p => p - 1)}>Prev</Button>
                    <span className="text-xs text-muted-foreground">{companySwipesPage}/{totalCompanySwipesPages}</span>
                    <Button size="sm" variant="outline" className="text-xs h-6" disabled={companySwipesPage === totalCompanySwipesPages} onClick={() => setCompanySwipesPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Jobs per Company */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Jobs Listed per Company</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {paginatedCompanyJobs.map((entry, i) => {
                  const maxJobs = Math.max(...companyBreakdown.map((e) => e.jobs))
                  const width = (entry.jobs / maxJobs) * 100
                  const globalIndex = (companyJobsPage - 1) * ANALYTICS_PER_PAGE + i
                  return (
                    <div key={entry.name} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{globalIndex + 1}.</span>
                      <span className="text-sm font-medium w-20 shrink-0 truncate">{entry.name}</span>
                      <div className="flex-1 h-5 rounded-full bg-accent/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium w-16 text-right shrink-0">{entry.jobs} jobs</span>
                    </div>
                  )
                })}
              </div>
              {totalCompanyJobsPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">{companyBreakdown.length} companies</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="text-xs h-6" disabled={companyJobsPage === 1} onClick={() => setCompanyJobsPage(p => p - 1)}>Prev</Button>
                    <span className="text-xs text-muted-foreground">{companyJobsPage}/{totalCompanyJobsPages}</span>
                    <Button size="sm" variant="outline" className="text-xs h-6" disabled={companyJobsPage === totalCompanyJobsPages} onClick={() => setCompanyJobsPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Applications Over Time Chart */}
      {(metricView === "all" || metricView === "applications") && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Right Swipes Over the Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={rightSwipesOverWeek}>
                  <defs>
                    <linearGradient id="weekGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.7 0.18 270)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.7 0.18 270)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "oklch(0.62 0.012 265)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.62 0.012 265)" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ backgroundColor: "oklch(0.16 0.006 265)", border: "1px solid oklch(0.24 0.008 265)", borderRadius: "8px", fontSize: 12, color: "oklch(0.97 0.003 265)" }} />
                  <Area type="monotone" dataKey="count" stroke="oklch(0.7 0.18 270)" strokeWidth={2} fill="url(#weekGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failure Reasons & Peak Hours */}
      {(metricView === "all") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Right Swipes Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={companyBreakdown.slice(0, 5)} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11, fill: "oklch(0.62 0.012 265)" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.62 0.012 265)" }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip contentStyle={{ backgroundColor: "oklch(0.16 0.006 265)", border: "1px solid oklch(0.24 0.008 265)", borderRadius: "8px", fontSize: 12, color: "oklch(0.97 0.003 265)" }} formatter={(value: number) => [value.toLocaleString(), "Right Swipes"]} />
                    <Bar dataKey="rightSwipes" radius={[0, 4, 4, 0]}>
                      {companyBreakdown.slice(0, 5).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Peak Right Swipe Hours</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={peakHoursData}>
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "oklch(0.62 0.012 265)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.62 0.012 265)" }} axisLine={false} tickLine={false} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: "oklch(0.16 0.006 265)", border: "1px solid oklch(0.24 0.008 265)", borderRadius: "8px", fontSize: 12, color: "oklch(0.97 0.003 265)" }} />
                    <Bar dataKey="count" fill="oklch(0.65 0.15 250)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

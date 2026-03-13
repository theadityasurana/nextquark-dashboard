"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useData } from "@/lib/data-context"
import {
  Download, TrendingUp, TrendingDown, Building2, Briefcase, Users, MousePointerClick,
  ArrowUpDown, ArrowUp, ArrowDown, Filter
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

export function AnalyticsScreen() {
  const { companies, jobs, applications } = useData()

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("all")
  const [sortField, setSortField] = useState<SortField>("rightSwipes")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [metricView, setMetricView] = useState<MetricView>("all")

  // Filtered data based on selected company
  const filteredJobs = useMemo(() => {
    if (selectedCompanyId === "all") return jobs
    return jobs.filter((job) => job.companyId === selectedCompanyId)
  }, [selectedCompanyId, jobs])

  const filteredApplications = useMemo(() => {
    if (selectedCompanyId === "all") return applications
    return applications.filter((app) => app.companyId === selectedCompanyId)
  }, [selectedCompanyId, applications])

  // Sorted jobs for the table
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

  // Summary statistics
  const totalJobsListed = filteredJobs.length
  const totalApplications = filteredApplications.length
  const totalRightSwipesFiltered = filteredJobs.reduce((sum, job) => sum + (job.rightSwipes ?? 0), 0)
  const totalRightSwipesAll = jobs.reduce((sum, job) => sum + (job.rightSwipes ?? 0), 0)
  const avgSuccessRate = filteredJobs.length > 0
    ? (filteredJobs.reduce((sum, job) => sum + job.successRate, 0) / filteredJobs.length).toFixed(1)
    : "0"

  // Per-company breakdown for the overview chart
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
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
  }

  const barColors = ["oklch(0.65 0.2 145)", "oklch(0.65 0.15 250)", "oklch(0.7 0.15 55)", "oklch(0.55 0.2 25)", "oklch(0.6 0.18 300)", "oklch(0.7 0.12 180)"]

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Detailed analytics and reporting across companies and jobs</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
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
            <div className="grid grid-cols-[1fr_2fr_100px_120px_100px] gap-4 px-4 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-medium">
              <button className="flex items-center gap-1 text-left" onClick={() => handleSort("title")}>
                Company / Job <SortIcon field="title" />
              </button>
              <span className="hidden sm:block">Title</span>
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
              {sortedJobs.map((job) => {
                const jobApps = applications.filter((a) => a.jobId === job.id)
                return (
                  <div
                    key={job.id}
                    className="grid grid-cols-[1fr_2fr_100px_120px_100px] gap-4 px-4 py-3 hover:bg-accent/30 transition-colors items-center"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-accent text-[10px] font-bold text-accent-foreground shrink-0">
                        {job.companyInitial}
                      </div>
                      <span className="text-xs font-medium truncate">{job.companyName}</span>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <p className="text-[10px] text-muted-foreground">{job.location}</p>
                    </div>
  <div className="text-right">
  <span className="text-sm font-bold">{(job.rightSwipes ?? 0).toLocaleString()}</span>
  </div>
  <div className="text-right">
  <span className="text-sm font-bold text-primary">{(job.rightSwipes ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">{job.successRate}%</span>
                      <div className="mt-1 h-1.5 rounded-full bg-accent/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-success/70"
                          style={{ width: `${job.successRate}%` }}
                        />
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
              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2">
                {companyBreakdown.map((entry, i) => {
                  const maxSwipes = companyBreakdown[0]?.rightSwipes || 1
                  const width = (entry.rightSwipes / maxSwipes) * 100
                  return (
                    <div key={entry.name} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                      <span className="text-sm font-medium w-20 shrink-0 truncate">{entry.name}</span>
                      <div className="flex-1 h-5 rounded-full bg-accent/50 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${width}%`, backgroundColor: barColors[i % barColors.length] }}
                        />
                      </div>
                      <span className="text-sm font-medium w-16 text-right shrink-0">{entry.rightSwipes.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Jobs per Company */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Jobs Listed per Company</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-2">
                {companyBreakdown.map((entry, i) => {
                  const maxJobs = Math.max(...companyBreakdown.map((e) => e.jobs))
                  const width = (entry.jobs / maxJobs) * 100
                  return (
                    <div key={entry.name} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
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
                      <stop offset="0%" stopColor="oklch(0.65 0.2 145)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.65 0.2 145)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ backgroundColor: "oklch(0.17 0.005 260)", border: "1px solid oklch(0.25 0.005 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }} />
                  <Area type="monotone" dataKey="count" stroke="oklch(0.65 0.2 145)" strokeWidth={2} fill="url(#weekGradient)" />
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
                    <XAxis type="number" tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip contentStyle={{ backgroundColor: "oklch(0.17 0.005 260)", border: "1px solid oklch(0.25 0.005 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }} formatter={(value: number) => [value.toLocaleString(), "Right Swipes"]} />
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
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} width={35} />
                    <Tooltip contentStyle={{ backgroundColor: "oklch(0.17 0.005 260)", border: "1px solid oklch(0.25 0.005 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }} />
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

"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/status-badge"
import { Activity, CheckCircle2, XCircle, Clock, ArrowUpRight, TrendingUp, Users, Briefcase, Server } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { useEffect, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function OverviewScreen() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [chartRange, setChartRange] = useState('24h')
  const [companyRange, setCompanyRange] = useState('24h')
  const [agentRange, setAgentRange] = useState('24h')
  const [jobRange, setJobRange] = useState('7d')

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/overview?chartRange=${chartRange}&companyRange=${companyRange}&agentRange=${agentRange}&jobRange=${jobRange}`)
        const json = await res.json()
        setData(json)
      } catch (err) {
        console.error('Failed to fetch overview:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [chartRange, companyRange, agentRange, jobRange])

  if (loading || !data) {
    return <div className="flex items-center justify-center h-96">Loading...</div>
  }

  const stats = [
    { label: "Total Applications", value: data.stats.totalAll.toString(), sub: "all time", icon: Activity },
    { label: "Today", value: data.stats.totalToday.toString(), sub: "applications", icon: Clock },
    { label: "Active Now", value: data.stats.activeNow.toString(), sub: "processing", icon: TrendingUp },
    { label: "Success Rate", value: `${data.stats.successRate}%`, sub: `${data.stats.completedAll}/${data.stats.totalAll}`, icon: CheckCircle2 },
    { label: "Failed (All)", value: data.stats.failedAll.toString(), sub: "total failures", icon: XCircle },
    { label: "Failed (Today)", value: data.stats.failedToday.toString(), sub: "today", icon: XCircle },
  ]

  const recentApps = data.recentApps
  const topCompanies = data.topCompanies
  const activeAgents = data.agents

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time system health and key metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</span>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2">
                <span className="text-3xl font-bold tracking-tight">{stat.value}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">{stat.sub}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Live Stream */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <CardTitle className="text-sm font-medium">Live Application Stream</CardTitle>
            </div>
            <Badge variant="secondary" className="text-[10px] bg-secondary text-secondary-foreground">Last 10</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {recentApps.map((app: any) => (
              <div key={app.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] text-muted-foreground font-mono w-14 shrink-0">{app.startedAt !== "-" ? app.startedAt : app.createdAt}</span>
                  <span className="text-sm font-medium truncate">{app.userName}</span>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">{app.companyName} - {app.jobTitle}</span>
                </div>
                <StatusBadge status={app.status} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Charts + Top Companies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Applications Chart */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Applications Over Time</CardTitle>
              <Select value={chartRange} onValueChange={setChartRange}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.applicationsChart}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.65 0.2 145)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.65 0.2 145)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.17 0.005 260)", border: "1px solid oklch(0.25 0.005 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }}
                  />
                  <Area type="monotone" dataKey="count" stroke="oklch(0.65 0.2 145)" strokeWidth={2} fill="url(#areaGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Companies */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Top Companies</CardTitle>
              <Select value={companyRange} onValueChange={setCompanyRange}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {topCompanies.map((company: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-foreground">
                    {company.logoInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{company.name}</p>
                    <p className="text-[11px] text-muted-foreground">{company.appsToday} apps</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{company.successRate}%</p>
                    <p className="text-[11px] text-muted-foreground">success</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Portal Health */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Portal Health Status</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.portalHealth && data.portalHealth.length > 0 ? (
            <div className="divide-y divide-border">
              {data.portalHealth.map((portal: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Server className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{portal.portalType}</span>
                    <StatusBadge status={portal.status} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Avg: {portal.avgResponseTime}ms</span>
                    <span className={portal.failureRate > 10 ? "text-destructive" : ""}>
                      Failures: {portal.failureRate}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No portal data available yet. Portal metrics will appear after applications are processed.
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Activity */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Most Active Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.userActivity && data.userActivity.length > 0 ? (
            <div className="divide-y divide-border">
              {data.userActivity.map((user: any, i: number) => (
                <div key={user.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{user.totalApps} apps</p>
                    <p className="text-xs text-muted-foreground">{user.successRate}% success</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No user data available. User activity will appear after users are created.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job Insights */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Most Applied Jobs</CardTitle>
            <Select value={jobRange} onValueChange={setJobRange}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {data.jobInsights && data.jobInsights.length > 0 ? (
            <div className="divide-y divide-border">
              {data.jobInsights.map((job: any, i: number) => (
                <div key={job.jobId} className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{job.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{job.company}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium">{job.applications} apps</p>
                    <p className="text-xs text-muted-foreground">{job.rightSwipes} swipes • {job.successRate}%</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No job data available for selected time range.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Status */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">AI Agent Status</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={agentRange} onValueChange={setAgentRange}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="text-[10px] bg-secondary text-secondary-foreground">{activeAgents.length} agents</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {activeAgents.map((agent: any) => (
              <div key={agent.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-mono font-medium w-20 shrink-0">{agent.id}</span>
                  <StatusBadge status={agent.status} />
                </div>
                <span className="text-xs text-muted-foreground truncate max-w-xs hidden sm:block">
                  {agent.status === "active" && agent.currentJob && `Processing: ${agent.currentJob} (${agent.currentUser})`}
                  {agent.status === "idle" && agent.currentJob ? agent.currentJob : "Waiting for tasks"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

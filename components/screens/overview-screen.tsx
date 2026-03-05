"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/status-badge"
import { mockApplications, mockAgents, mockChartData } from "@/lib/mock-data"
import { useData } from "@/lib/data-context"
import { Activity, CheckCircle2, XCircle, Clock, ArrowUpRight, TrendingUp } from "lucide-react"
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"

const stats = [
  { label: "Total Today", value: "1,247", sub: "applications", icon: Activity, trend: "+12%", trendUp: true },
  { label: "Active Now", value: "23", sub: "running", icon: Clock, trend: null, trendUp: false },
  { label: "Success Rate", value: "94.3%", sub: "completion", icon: CheckCircle2, trend: "+2.1%", trendUp: true },
  { label: "Failed Today", value: "18", sub: "applications", icon: XCircle, trend: "-5%", trendUp: true },
]

export function OverviewScreen() {
  const { companies } = useData()
  const recentApps = mockApplications.slice(0, 10)
  const topCompanies = companies.length > 0 ? companies.slice(0, 5) : []
  const activeAgents = mockAgents.slice(0, 6)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time system health and key metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                  {stat.trend && (
                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${stat.trendUp ? "text-success" : "text-destructive"}`}>
                      <TrendingUp className="h-3 w-3" />
                      {stat.trend}
                    </span>
                  )}
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
            {recentApps.map((app) => (
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
        {/* Applications per Hour Chart */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Applications / Hour</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockChartData.applicationsPerHour}>
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
            <CardTitle className="text-sm font-medium">Top Companies (Today)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              {topCompanies.map((company, i) => (
                <div key={company.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-foreground">
                    {company.logoInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{company.name}</p>
                    <p className="text-[11px] text-muted-foreground">{company.appsToday} apps today</p>
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

      {/* Agent Status */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">AI Agent Status</CardTitle>
            <Badge variant="secondary" className="text-[10px] bg-secondary text-secondary-foreground">10 agents</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {activeAgents.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-mono font-medium w-20 shrink-0">{agent.id}</span>
                  <StatusBadge status={agent.status} />
                </div>
                <span className="text-xs text-muted-foreground truncate max-w-xs hidden sm:block">
                  {agent.status === "active" && `Processing: ${agent.currentJob} (${agent.currentUser})`}
                  {agent.status === "idle" && `Last: ${agent.lastJob}`}
                  {agent.status === "error" && `Failed: ${agent.lastError}`}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

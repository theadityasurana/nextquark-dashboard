"use client"

import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { StatusBadge } from "@/components/status-badge"
import {
  RefreshCw, CheckCircle2, Clock, Activity, ArrowUpRight, Building2, Users, Briefcase,
  Bot, Globe, DatabaseZap, Inbox, Target,
} from "lucide-react"
import Link from "next/link"
import { SystemHealthPanel } from "@/components/system-health-panel"
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { useState } from "react"
import { useApi } from "@/lib/api-cache"
import { useUIPreferences } from "@/hooks/use-ui-preferences"
import { AnalyticsScreen } from "@/components/screens/analytics-screen"
import {
  PageHeader, Panel, PanelHeader, StatCard, Sparkline, Meter, TableHead, EmptyState, Segmented, Avatar,
} from "@/components/ui/dashboard"

const TT = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: 12,
  color: "var(--popover-foreground)",
  padding: "8px 12px",
  boxShadow: "var(--shadow-pop)",
}

const RANGE_LABEL: Record<string, string> = { "1h": "last hour", "24h": "last 24 hours", "7d": "last 7 days", "30d": "last 30 days" }

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-14 w-72 rounded-lg bg-muted/60 shimmer" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="panel h-36 shimmer" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="panel h-80 lg:col-span-2 shimmer" />
        <div className="panel h-80 shimmer" />
      </div>
    </div>
  )
}

export function OverviewScreen() {
  const [refreshing, setRefreshing] = useState(false)
  const { prefs, setPrefs } = useUIPreferences()
  const { chartRange, companyRange, agentRange, jobRange } = prefs

  const { data, isLoading: loading, refresh: fetchData } = useApi<any>(
    `/api/overview?chartRange=${chartRange}&companyRange=${companyRange}&agentRange=${agentRange}&jobRange=${jobRange}`,
  )

  const handleRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false) }

  if (loading || !data) return <OverviewSkeleton />

  const { stats, recentApps, topCompanies, agents, portalHealth, userActivity, jobInsights, syncActivity, applicationsChart } = data
  const activeAgents = agents.filter((a: any) => a.status === "active")
  const rangeTotal = (applicationsChart || []).reduce((n: number, p: any) => n + (p.count || 0), 0)
  const resolved = stats.completedAll + stats.failedAll
  const successRate = resolved > 0 ? (stats.completedAll / resolved) * 100 : 0
  const todayResolved = (stats.completedToday ?? 0) + (stats.failedToday ?? 0)
  const outcome = [
    { name: "Completed", value: stats.completedAll, color: "var(--success)" },
    { name: "Failed", value: stats.failedAll, color: "var(--destructive)" },
    { name: "Other", value: Math.max(0, stats.totalAll - resolved), color: "var(--chart-1)" },
  ].filter((o) => o.value > 0)
  const maxCompanyApps = Math.max(1, ...topCompanies.map((c: any) => c.appsToday || 0))
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={today}
        title={`${greeting()}, Aditya`}
        description="Here's what's happening across Iris today."
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-2" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" asChild className="gap-1.5">
              <Link href="/queue">Open live queue <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </>
        }
      />

      <Tabs defaultValue="overview" className="w-full gap-6">
        <TabsList>
          <TabsTrigger value="overview" className="px-4">Overview</TabsTrigger>
          <TabsTrigger value="analytics" className="px-4">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6">

          {/* KPI row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total applications"
              value={stats.totalAll}
              icon={Activity}
              delta={`+${stats.totalToday.toLocaleString()} today`}
              deltaTone={stats.totalToday > 0 ? "positive" : "neutral"}
            >
              <div className="h-10 -mx-1"><Sparkline id="total" data={applicationsChart} /></div>
            </StatCard>
            <StatCard
              label="Submitted today"
              value={stats.totalToday}
              icon={Clock}
              footnote={
                <span className="flex items-center gap-3 tabular-nums">
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" />{(stats.completedToday ?? 0).toLocaleString()} completed</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />{(stats.failedToday ?? 0).toLocaleString()} failed</span>
                </span>
              }
            >
              <Meter value={stats.completedToday ?? 0} max={Math.max(1, todayResolved)} tone="success" />
            </StatCard>
            <StatCard
              label="Success rate"
              value={`${successRate.toFixed(1)}%`}
              icon={Target}
              delta={successRate >= 90 ? "Healthy" : successRate >= 75 ? "Watch" : "At risk"}
              deltaTone={successRate >= 90 ? "positive" : successRate >= 75 ? "neutral" : "negative"}
              footnote={`${stats.completedAll.toLocaleString()} of ${resolved.toLocaleString()} resolved runs`}
            >
              <Meter value={successRate} tone={successRate >= 90 ? "success" : successRate >= 75 ? "warning" : "destructive"} />
            </StatCard>
            <StatCard
              label="Processing now"
              value={stats.activeNow}
              icon={Bot}
              live={stats.activeNow > 0}
              footnote={`${activeAgents.length} active agent${activeAgents.length === 1 ? "" : "s"} · ${Number(stats.totalJobs || 0).toLocaleString()} jobs indexed`}
            >
              <Meter value={activeAgents.length} max={Math.max(1, agents.length)} />
            </StatCard>
          </div>

          {/* Chart + outcome mix */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
                <div>
                  <p className="text-[13px] font-medium text-muted-foreground">Applications</p>
                  <p className="num mt-1 text-2xl font-semibold">{rangeTotal.toLocaleString()}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">in the {RANGE_LABEL[chartRange] ?? chartRange}</p>
                </div>
                <Segmented
                  value={chartRange}
                  onChange={(v) => setPrefs({ chartRange: v })}
                  options={[{ value: "1h", label: "1H" }, { value: "24h", label: "24H" }, { value: "7d", label: "7D" }, { value: "30d", label: "30D" }]}
                />
              </div>
              <div className="h-64 px-2 pb-4 pt-6">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={applicationsChart} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="time" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickMargin={8} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                    <Tooltip contentStyle={TT} cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }} />
                    <Area type="monotone" dataKey="count" name="Applications" stroke="var(--chart-1)" strokeWidth={2} fill="url(#ag)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel className="flex flex-col">
              <PanelHeader title="Outcome mix" description="All-time application results" />
              <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5 py-5">
                <div className="relative h-40 w-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={outcome} dataKey="value" innerRadius={54} outerRadius={72} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                        {outcome.map((o) => <Cell key={o.name} fill={o.color} />)}
                      </Pie>
                      <Tooltip contentStyle={TT} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="num text-xl font-semibold">{successRate.toFixed(0)}%</span>
                    <span className="text-[11px] text-muted-foreground">success</span>
                  </div>
                </div>
                <div className="w-full space-y-2.5">
                  {outcome.map((o) => (
                    <div key={o.name} className="flex items-center justify-between text-[13px]">
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: o.color }} />{o.name}
                      </span>
                      <span className="num font-medium">{o.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          </div>

          <SystemHealthPanel />

          {/* Recent applications + top companies */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <PanelHeader
                title="Recent applications"
                description="Latest 10 submissions across all users"
                actions={<Button size="sm" variant="ghost" asChild className="h-7 gap-1 text-xs text-muted-foreground"><Link href="/queue">View all <ArrowUpRight className="h-3 w-3" /></Link></Button>}
              />
              {recentApps.length > 0 ? (
                <>
                  <TableHead columns={[
                    { label: "Candidate", className: "w-44 shrink-0" },
                    { label: "Company · Role", className: "flex-1 hidden sm:block" },
                    { label: "Time", className: "w-24 shrink-0 hidden md:block text-right" },
                    { label: "Status", className: "w-28 shrink-0 text-right" },
                  ]} />
                  <div className="divide-y divide-border">
                    {recentApps.map((app: any) => (
                      <div key={app.id} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40">
                        <div className="flex w-44 shrink-0 items-center gap-2.5 min-w-0">
                          <Avatar name={app.userName} />
                          <span className="truncate text-[13px] font-medium">{app.userName}</span>
                        </div>
                        <div className="hidden min-w-0 flex-1 sm:block">
                          <p className="truncate text-[13px]">{app.companyName}</p>
                          <p className="truncate text-xs text-muted-foreground">{app.jobTitle}</p>
                        </div>
                        <span className="hidden w-24 shrink-0 whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-muted-foreground md:block">
                          {app.startedAt !== "-" ? app.startedAt : app.createdAt}
                        </span>
                        <div className="flex w-28 shrink-0 justify-end"><StatusBadge status={app.status} /></div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={Inbox} title="No recent applications" description="New submissions will appear here in real time." />
              )}
            </Panel>

            <Panel>
              <PanelHeader
                title="Top companies"
                description="By applications submitted"
                actions={
                  <Segmented value={companyRange} onChange={(v) => setPrefs({ companyRange: v })}
                    options={[{ value: "24h", label: "24H" }, { value: "7d", label: "7D" }, { value: "30d", label: "30D" }]} />
                }
              />
              {topCompanies.length > 0 ? (
                <div className="divide-y divide-border">
                  {topCompanies.map((c: any, i: number) => (
                    <div key={i} className="flex flex-col gap-2 px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 text-[11px] font-semibold">{c.logoInitial}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">{c.appsToday} applications</p>
                        </div>
                        <span className="num shrink-0 text-[13px] font-medium text-success">{c.successRate}%</span>
                      </div>
                      <Meter value={c.appsToday} max={maxCompanyApps} className="h-1" />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Building2} title="No data for this range" />
              )}
            </Panel>
          </div>

          {/* Portal health + Users */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader title="Portal health" description="Response time and failure rate by ATS" icon={Globe} />
              {portalHealth && portalHealth.length > 0 ? (
                <>
                  <TableHead columns={[
                    { label: "Portal", className: "flex-1" },
                    { label: "Avg latency", className: "w-24 text-right" },
                    { label: "Failure", className: "w-20 text-right" },
                    { label: "Status", className: "w-24 text-right" },
                  ]} />
                  <div className="divide-y divide-border">
                    {portalHealth.map((p: any, i: number) => (
                      <div key={i} className="flex items-center gap-4 px-5 py-2.5 transition-colors hover:bg-muted/40">
                        <span className="flex-1 truncate text-[13px] font-medium">{p.portalType}</span>
                        <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">{p.avgResponseTime}ms</span>
                        <span className={`w-20 text-right text-xs tabular-nums ${Number(p.failureRate) > 10 ? "font-medium text-destructive" : "text-muted-foreground"}`}>{p.failureRate}%</span>
                        <div className="flex w-24 justify-end"><StatusBadge status={p.status} /></div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={Globe} title="No portal data yet" />
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Most active users" description="Ranked by total applications" icon={Users} />
              {userActivity && userActivity.length > 0 ? (
                <div className="divide-y divide-border">
                  {userActivity.map((u: any, i: number) => (
                    <div key={u.id} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40">
                      <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                      <Avatar name={u.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{u.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="num text-[13px] font-semibold">{u.totalApps}</p>
                        <p className="text-[11px] tabular-nums text-success">{u.successRate}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Users} title="No user data yet" />
              )}
            </Panel>
          </div>

          {/* Jobs + Agents */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Most applied jobs"
                icon={Briefcase}
                actions={<Segmented value={jobRange} onChange={(v) => setPrefs({ jobRange: v })}
                  options={[{ value: "24h", label: "24H" }, { value: "7d", label: "7D" }, { value: "30d", label: "30D" }]} />}
              />
              {jobInsights && jobInsights.length > 0 ? (
                <div className="divide-y divide-border">
                  {jobInsights.map((j: any, i: number) => (
                    <div key={j.jobId} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40">
                      <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{j.title}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{j.company}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="num text-[13px] font-semibold">{j.applications}</p>
                        <p className="text-[11px] tabular-nums text-muted-foreground">{j.rightSwipes} swipes</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Briefcase} title="No data for this range" />
              )}
            </Panel>

            <Panel>
              <PanelHeader
                title="AI agents"
                description={`${activeAgents.length} running`}
                icon={Bot}
                actions={<Segmented value={agentRange} onChange={(v) => setPrefs({ agentRange: v })}
                  options={[{ value: "1h", label: "1H" }, { value: "24h", label: "24H" }, { value: "7d", label: "7D" }]} />}
              />
              {activeAgents.length > 0 ? (
                <div className="divide-y divide-border">
                  {activeAgents.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40">
                      <span className="w-20 shrink-0 font-mono text-xs font-medium">{a.id}</span>
                      <span className="flex-1 truncate text-xs text-muted-foreground">{a.currentJob}</span>
                      <StatusBadge status={a.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={Bot} title="No active agents" description="Agents appear here while they're filling applications." />
              )}
            </Panel>
          </div>

          {/* Sync activity */}
          <Panel>
            <PanelHeader title="Job sync activity" description="ATS company sync results" icon={DatabaseZap} />
            <div className="grid grid-cols-2 divide-border border-b border-border sm:grid-cols-4 sm:divide-x">
              {[
                { label: "Companies synced", value: syncActivity?.totals?.companiesSynced ?? 0, dot: "bg-chart-1" },
                { label: "Jobs added",       value: syncActivity?.totals?.added ?? 0,           dot: "bg-success" },
                { label: "Jobs updated",     value: syncActivity?.totals?.updated ?? 0,         dot: "bg-chart-2" },
                { label: "Jobs removed",     value: syncActivity?.totals?.deleted ?? 0,         dot: "bg-destructive" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col gap-1.5 px-5 py-4">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}</span>
                  <span className="num text-xl font-semibold">{s.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
            {syncActivity?.byCompany?.length > 0 ? (
              <>
                <TableHead className="hidden sm:flex" columns={[
                  { label: "Company", className: "flex-1" },
                  { label: "Added", className: "w-20 text-right" },
                  { label: "Updated", className: "w-20 text-right" },
                  { label: "Removed", className: "w-20 text-right" },
                ]} />
                <div className="divide-y divide-border">
                  {syncActivity.byCompany.map((c: any) => (
                    <div key={c.name} className="flex items-center gap-4 px-5 py-2.5 transition-colors hover:bg-muted/40">
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 text-[10px] font-semibold">{c.initial}</div>
                        <span className="truncate text-[13px] font-medium">{c.name}</span>
                      </div>
                      <span className="w-20 text-right text-xs tabular-nums text-success">{c.added > 0 ? `+${c.added}` : "—"}</span>
                      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{c.updated > 0 ? c.updated : "—"}</span>
                      <span className="w-20 text-right text-xs tabular-nums text-destructive">{c.deleted > 0 ? `−${c.deleted}` : "—"}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState icon={DatabaseZap} title="No sync data yet" />
            )}
          </Panel>

        </TabsContent>

        {/* ─────────────── Analytics tab ─────────────── */}
        <TabsContent value="analytics">
          <AnalyticsScreen />
        </TabsContent>
      </Tabs>
    </div>
  )
}

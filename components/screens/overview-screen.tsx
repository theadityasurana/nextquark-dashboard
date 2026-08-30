"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { StatusBadge } from "@/components/status-badge"
import {
  RefreshCw, TrendingUp, CheckCircle2, XCircle, Clock, Activity,
  Plus, Minus, RotateCcw
} from "lucide-react"
import { SystemHealthPanel } from "@/components/system-health-panel"
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts"
import { useEffect, useState, useCallback } from "react"
import { useUIPreferences } from "@/hooks/use-ui-preferences"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AnalyticsScreen } from "@/components/screens/analytics-screen"

const TT = {
  backgroundColor: "oklch(0.13 0.006 265)",
  border: "1px solid oklch(0.22 0.008 265)",
  borderRadius: "6px",
  fontSize: 11,
  color: "oklch(0.92 0.003 265)",
  padding: "6px 10px",
}

function Kpi({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub: string
  icon: React.ElementType; accent: string
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div>
        <p className="text-[28px] font-bold tracking-tight leading-none">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 mb-3">{children}</p>
  )
}

export function OverviewScreen() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const { prefs, setPrefs } = useUIPreferences()
  const { chartRange, companyRange, agentRange, jobRange } = prefs

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/overview?chartRange=${chartRange}&companyRange=${companyRange}&agentRange=${agentRange}&jobRange=${jobRange}`)
      const json = await res.json()
      if (!json.error) setData(json)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [chartRange, companyRange, agentRange, jobRange])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false) }

  if (loading || !data) return (
    <div className="flex items-center justify-center h-96">
      <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )

  const { stats, recentApps, topCompanies, agents, portalHealth, userActivity, jobInsights, syncActivity, applicationsChart } = data
  const activeAgents = agents.filter((a: any) => a.status === "active")

  return (
    <div className="flex flex-col gap-8">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gradient">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time metrics and analytics</p>
        </div>
        <Button size="sm" variant="outline" className="gap-2 h-8 text-xs" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-transparent border-0 p-0 h-auto gap-0 border-b border-border w-full rounded-none justify-start">
          {["overview", "analytics"].map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground text-muted-foreground px-4 pb-3 pt-0 h-auto text-sm font-medium capitalize transition-colors"
            >
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ─────────────── Overview tab ─────────────── */}
        <TabsContent value="overview" className="mt-8 flex flex-col gap-8">

          <SystemHealthPanel />

          {/* KPI row */}
          <div>
            <SectionLabel>Key Metrics</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Kpi label="Total"     value={stats.totalAll}     sub="all time"     icon={Activity}     accent="bg-primary/10 text-primary" />
              <Kpi label="Today"     value={stats.totalToday}   sub="applications" icon={Clock}        accent="bg-blue-500/10 text-blue-400" />
              <Kpi label="Active"    value={stats.activeNow}    sub="processing"   icon={TrendingUp}   accent="bg-yellow-500/10 text-yellow-400" />
              <Kpi label="Completed" value={stats.completedAll} sub="all time"     icon={CheckCircle2} accent="bg-green-500/10 text-green-400" />
              <Kpi label="Failed"    value={stats.failedAll}    sub="all time"     icon={XCircle}      accent="bg-destructive/10 text-destructive" />
            </div>
          </div>

          {/* Chart + Top Companies */}
          <div>
            <SectionLabel>Activity</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Chart — 2/3 width */}
              <div className="lg:col-span-2 rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-4 pb-0">
                  <p className="text-sm font-medium">Applications over time</p>
                  <Select value={chartRange} onValueChange={(v) => setPrefs({ chartRange: v })}>
                    <SelectTrigger className="h-7 w-28 text-xs border-border/60 bg-transparent"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">Last hour</SelectItem>
                      <SelectItem value="24h">Last 24h</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="h-52 px-2 pb-3 pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={applicationsChart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="oklch(0.7 0.18 270)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="oklch(0.7 0.18 270)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={TT} cursor={{ stroke: "oklch(0.35 0.01 265)", strokeWidth: 1 }} />
                      <Area type="monotone" dataKey="count" stroke="oklch(0.7 0.18 270)" strokeWidth={1.5} fill="url(#ag)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top Companies — 1/3 width */}
              <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)]">
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/40">
                  <p className="text-sm font-medium">Top companies</p>
                  <Select value={companyRange} onValueChange={(v) => setPrefs({ companyRange: v })}>
                    <SelectTrigger className="h-7 w-20 text-xs border-border/60 bg-transparent"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24h</SelectItem>
                      <SelectItem value="7d">7d</SelectItem>
                      <SelectItem value="30d">30d</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="divide-y divide-border/40">
                  {topCompanies.length > 0 ? topCompanies.map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                      <span className="text-[10px] text-muted-foreground/50 w-3 shrink-0 font-mono">{i + 1}</span>
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/60 text-[10px] font-bold shrink-0">{c.logoInitial}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.appsToday} apps</p>
                      </div>
                      <span className="text-xs font-semibold text-green-400 shrink-0">{c.successRate}%</span>
                    </div>
                  )) : (
                    <p className="text-xs text-muted-foreground px-5 py-8 text-center">No data for this range</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Live stream */}
          <div>
            <SectionLabel>Live stream</SectionLabel>
            <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                  </span>
                  <span className="text-xs font-medium">Recent applications</span>
                </div>
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">last 10</Badge>
              </div>
              {recentApps.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {recentApps.map((app: any) => (
                    <div key={app.id} className="flex items-center gap-4 px-5 py-2.5 hover:bg-accent/20 transition-colors">
                      <span className="text-[10px] text-muted-foreground/50 font-mono w-12 shrink-0 tabular-nums">
                        {app.startedAt !== "-" ? app.startedAt : app.createdAt}
                      </span>
                      <span className="text-xs font-medium w-28 shrink-0 truncate">{app.userName}</span>
                      <span className="text-[11px] text-muted-foreground flex-1 truncate hidden sm:block">
                        {app.companyName} · {app.jobTitle}
                      </span>
                      <StatusBadge status={app.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground px-5 py-8 text-center">No recent applications</p>
              )}
            </div>
          </div>

          {/* Portal health + Users */}
          <div>
            <SectionLabel>Infrastructure & Users</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                <div className="px-5 py-3 border-b border-border/40">
                  <p className="text-xs font-medium">Portal health</p>
                </div>
                {portalHealth && portalHealth.length > 0 ? (
                  <div className="divide-y divide-border/30">
                    {portalHealth.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between px-5 py-2.5 hover:bg-accent/20 transition-colors">
                        <div className="flex items-center gap-2.5">
                          <StatusBadge status={p.status} />
                          <span className="text-xs font-medium">{p.portalType}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                          <span className="tabular-nums">{p.avgResponseTime}ms avg</span>
                          <span className={Number(p.failureRate) > 10 ? "text-destructive font-medium" : "tabular-nums"}>
                            {p.failureRate}% fail
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground px-5 py-8 text-center">No portal data yet</p>
                )}
              </div>

              <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                <div className="px-5 py-3 border-b border-border/40">
                  <p className="text-xs font-medium">Most active users</p>
                </div>
                {userActivity && userActivity.length > 0 ? (
                  <div className="divide-y divide-border/30">
                    {userActivity.map((u: any, i: number) => (
                      <div key={u.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent/20 transition-colors">
                        <span className="text-[10px] text-muted-foreground/50 font-mono w-3 shrink-0">{i + 1}</span>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/60 text-[9px] font-bold shrink-0">
                          {u.name?.charAt(0) || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{u.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold tabular-nums">{u.totalApps}</p>
                          <p className="text-[10px] text-green-400 tabular-nums">{u.successRate}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground px-5 py-8 text-center">No user data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Jobs + Agents */}
          <div>
            <SectionLabel>Jobs & Agents</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
                  <p className="text-xs font-medium">Most applied jobs</p>
                  <Select value={jobRange} onValueChange={(v) => setPrefs({ jobRange: v })}>
                    <SelectTrigger className="h-7 w-20 text-xs border-border/60 bg-transparent"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24h</SelectItem>
                      <SelectItem value="7d">7d</SelectItem>
                      <SelectItem value="30d">30d</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {jobInsights && jobInsights.length > 0 ? (
                  <div className="divide-y divide-border/30">
                    {jobInsights.map((j: any, i: number) => (
                      <div key={j.jobId} className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent/20 transition-colors">
                        <span className="text-[10px] text-muted-foreground/50 font-mono w-3 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{j.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{j.company}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-semibold tabular-nums">{j.applications} apps</p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">{j.rightSwipes} swipes</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground px-5 py-8 text-center">No data for this range</p>
                )}
              </div>

              <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
                  <p className="text-xs font-medium">AI agents</p>
                  <div className="flex items-center gap-2">
                    <Select value={agentRange} onValueChange={(v) => setPrefs({ agentRange: v })}>
                      <SelectTrigger className="h-7 w-20 text-xs border-border/60 bg-transparent"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1h">1h</SelectItem>
                        <SelectItem value="24h">24h</SelectItem>
                        <SelectItem value="7d">7d</SelectItem>
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 tabular-nums">{activeAgents.length} active</Badge>
                  </div>
                </div>
                {activeAgents.length > 0 ? (
                  <div className="divide-y divide-border/30">
                    {activeAgents.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent/20 transition-colors">
                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                        </span>
                        <span className="text-xs font-mono font-medium w-20 shrink-0">{a.id}</span>
                        <span className="text-[11px] text-muted-foreground truncate flex-1">{a.currentJob}</span>
                        <StatusBadge status={a.status} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground px-5 py-8 text-center">No active agents</p>
                )}
              </div>
            </div>
          </div>

          {/* Sync activity */}
          <div>
            <SectionLabel>Sync activity</SectionLabel>
            <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
              {/* Totals strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-border/40 border-b border-border/40">
                {[
                  { label: "Companies synced", value: syncActivity?.totals?.companiesSynced ?? 0, color: "text-primary" },
                  { label: "Jobs added",        value: syncActivity?.totals?.added ?? 0,            color: "text-green-400" },
                  { label: "Jobs updated",      value: syncActivity?.totals?.updated ?? 0,          color: "text-blue-400" },
                  { label: "Jobs deleted",      value: syncActivity?.totals?.deleted ?? 0,          color: "text-destructive" },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col gap-1 px-5 py-4">
                    <p className={`text-xl font-bold tabular-nums leading-none ${s.color}`}>{s.value.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* Per-company table */}
              {syncActivity?.byCompany?.length > 0 ? (
                <div className="divide-y divide-border/30">
                  <div className="hidden sm:grid grid-cols-4 px-5 py-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50">
                    <span className="col-span-1">Company</span>
                    <span className="text-center text-green-400/70">Added</span>
                    <span className="text-center text-blue-400/70">Updated</span>
                    <span className="text-center text-destructive/70">Deleted</span>
                  </div>
                  {syncActivity.byCompany.map((c: any) => (
                    <div key={c.name} className="grid grid-cols-2 sm:grid-cols-4 items-center px-5 py-2.5 hover:bg-accent/20 transition-colors gap-y-1">
                      <div className="flex items-center gap-2 col-span-2 sm:col-span-1 min-w-0">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent/60 text-[9px] font-bold">{c.initial}</div>
                        <span className="text-xs font-medium truncate">{c.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-green-400 text-center tabular-nums">{c.added > 0 ? `+${c.added}` : "—"}</span>
                      <span className="text-xs font-semibold text-blue-400 text-center tabular-nums">{c.updated > 0 ? c.updated : "—"}</span>
                      <span className="text-xs font-semibold text-destructive text-center tabular-nums">{c.deleted > 0 ? `-${c.deleted}` : "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground px-5 py-8 text-center">No sync data yet</p>
              )}
            </div>
          </div>

        </TabsContent>

        {/* ─────────────── Analytics tab ─────────────── */}
        <TabsContent value="analytics" className="mt-8">
          <AnalyticsScreen />
        </TabsContent>
      </Tabs>
    </div>
  )
}

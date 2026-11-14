"use client"

import { useState } from "react"
import { useApi } from "@/lib/api-cache"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Activity, Briefcase, Target, Users, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Panel, PanelHeader, StatCard, KpiGrid, Meter, Segmented, EmptyState, ChartSkeleton,
  chartTooltip, axisTick, gridStroke,
} from "@/components/ui/dashboard"

type Analytics = {
  totals: {
    applications: number; completed: number; failed: number; successRate: number
    applicants: number; companies: number; jobsListed: number; jobsAdded: number
  }
  status: Record<string, number>
  daily: { date: string; completed: number; failed: number; other: number }[]
  hours: { hour: number; count: number }[]
  topCompanies: { name: string; total: number; completed: number; failed: number }[]
}

const STATUS_LABEL: Record<string, string> = {
  completed: "Completed", failed: "Failed", pending: "Pending", processing: "Processing",
  blocked: "Won't apply", awaiting_otp: "Awaiting OTP", awaiting_captcha: "CAPTCHA",
}
const STATUS_TONE: Record<string, string> = {
  completed: "bg-success", failed: "bg-destructive", pending: "bg-muted-foreground", processing: "bg-chart-2",
  blocked: "bg-orange-500", awaiting_otp: "bg-warning", awaiting_captcha: "bg-warning",
}

const hourLabel = (h: number) => (h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`)
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })

/** Overview › Analytics: application outcomes over a range, aggregated server-side. */
export function AnalyticsScreen() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d")
  const { data, isLoading: firstLoad, isSwitching, refresh, error } = useApi<Analytics>(`/api/analytics?range=${range}`)
  // Skeletons both on first load and while a new range loads.
  const isLoading = firstLoad || isSwitching
  const [refreshing, setRefreshing] = useState(false)
  const t = data?.totals
  const peak = Math.max(0, ...(data?.hours ?? []).map((h) => h.count))
  const statusTotal = Object.values(data?.status ?? {}).reduce((n, v) => n + v, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={range} onChange={setRange} options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }]} />
        <Button size="sm" variant="outline" className="gap-2" disabled={refreshing}
          onClick={async () => { setRefreshing(true); await refresh(); setRefreshing(false) }}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {error && !data && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">Couldn&apos;t load analytics. Try Refresh.</div>
      )}

      {isLoading || !t ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="panel h-36 shimmer" />)}
        </div>
      ) : (
        <KpiGrid>
          <StatCard label="Applications" value={t.applications} icon={Activity} footnote={`across ${t.companies.toLocaleString()} companies`} />
          <StatCard label="Success rate" value={`${t.successRate}%`} icon={Target}
            footnote={`${t.completed.toLocaleString()} completed · ${t.failed.toLocaleString()} failed`}>
            <Meter value={t.successRate} tone={t.successRate >= 90 ? "success" : t.successRate >= 75 ? "warning" : "destructive"} />
          </StatCard>
          <StatCard label="Applicants" value={t.applicants} icon={Users}
            footnote={t.applicants ? `${(t.applications / t.applicants).toFixed(1)} applications each` : "no applicants in range"} />
          <StatCard label="Jobs listed" value={t.jobsListed} icon={Briefcase}
            delta={t.jobsAdded ? `+${t.jobsAdded.toLocaleString()} new` : undefined} deltaTone="positive" footnote="open roles in the catalogue" />
        </KpiGrid>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Applications per day" description="IST · by outcome" />
          <div className="h-72 px-3 pb-3 pt-5">
            {isLoading || !data ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={dayLabel} tick={axisTick} axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltip} labelFormatter={(d) => dayLabel(String(d))} cursor={{ fill: "color-mix(in oklch, var(--foreground) 4%, transparent)" }} />
                  <Bar dataKey="completed" name="Completed" stackId="a" fill="var(--success)" maxBarSize={28} />
                  <Bar dataKey="failed" name="Failed" stackId="a" fill="var(--destructive)" maxBarSize={28} />
                  <Bar dataKey="other" name="Other" stackId="a" fill="color-mix(in oklch, var(--chart-1) 45%, transparent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Outcomes" description={`${statusTotal.toLocaleString()} applications in range`} />
          <div className="flex flex-col gap-3.5 px-5 py-5">
            {isLoading || !data ? <ChartSkeleton className="min-h-56" /> : Object.entries(data.status).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-muted-foreground"><span className={`h-2 w-2 rounded-sm ${STATUS_TONE[k] ?? "bg-chart-1"}`} />{STATUS_LABEL[k] ?? k}</span>
                  <span className="num font-medium">{v.toLocaleString()} <span className="font-normal text-muted-foreground">· {statusTotal ? Math.round((v / statusTotal) * 100) : 0}%</span></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${STATUS_TONE[k] ?? "bg-chart-1"}`} style={{ width: `${statusTotal ? (v / statusTotal) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="When applications are created" description="Hour of day, IST · busiest hour highlighted" />
          <div className="h-60 px-3 pb-3 pt-5">
            {isLoading || !data ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.hours} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="hour" tickFormatter={hourLabel} tick={axisTick} axisLine={false} tickLine={false} interval={3} tickMargin={8} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                  <Tooltip contentStyle={chartTooltip} labelFormatter={(h) => `${hourLabel(Number(h))} IST`} cursor={{ fill: "color-mix(in oklch, var(--foreground) 4%, transparent)" }} />
                  <Bar dataKey="count" name="Applications" radius={[3, 3, 0, 0]}>
                    {data.hours.map((h) => <Cell key={h.hour} fill={h.count === peak && peak > 0 ? "var(--chart-1)" : "color-mix(in oklch, var(--chart-1) 35%, transparent)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Top companies" description="By applications in range, with success rate" />
          {isLoading || !data ? <div className="p-5"><ChartSkeleton className="min-h-52" /></div> : data.topCompanies.length === 0 ? (
            <EmptyState icon={Briefcase} title="No applications in this range" />
          ) : (
            <div className="divide-y divide-border">
              {data.topCompanies.map((c, i) => {
                const resolved = c.completed + c.failed
                const rate = resolved ? Math.round((c.completed / resolved) * 100) : null
                return (
                  <div key={c.name} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.name}</span>
                    <div className="hidden w-28 sm:block"><Meter value={c.total} max={data.topCompanies[0].total} className="h-1" /></div>
                    <span className="num w-10 shrink-0 text-right text-[13px]">{c.total}</span>
                    <span className={`w-12 shrink-0 text-right text-xs tabular-nums ${rate === null ? "text-muted-foreground" : rate >= 90 ? "text-success" : rate >= 75 ? "text-warning" : "text-destructive"}`}>
                      {rate === null ? "—" : `${rate}%`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

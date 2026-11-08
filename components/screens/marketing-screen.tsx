"use client"

import { useState, useMemo } from "react"
import { useApi } from "@/lib/api-cache"
import { heardAboutLabel, percentOf } from "@/lib/marketing"
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList,
  CartesianGrid, ReferenceLine,
} from "recharts"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BangaloreQrAnalytics } from "@/components/bangalore-qr-analytics"

const TT_STYLE = {
  backgroundColor: "oklch(0.13 0.006 265)",
  border: "1px solid oklch(0.22 0.008 265)",
  borderRadius: "8px",
  fontSize: 12,
  color: "oklch(0.92 0.003 265)",
  padding: "8px 12px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
}

const COLORS = [
  "oklch(0.7 0.18 270)",
  "oklch(0.7 0.16 220)",
  "oklch(0.72 0.18 155)",
  "oklch(0.78 0.16 70)",
  "oklch(0.65 0.22 0)",
  "oklch(0.72 0.18 320)",
  "oklch(0.68 0.18 190)",
  "oklch(0.75 0.14 40)",
]

// Custom tooltip for referral / day-of-week / provider bar charts
function BarTooltip({ active, payload, total }: { active?: boolean; payload?: any[]; total: number }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  const val = d.value as number
  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0"
  return (
    <div style={TT_STYLE}>
      <p className="font-semibold mb-1" style={{ color: d.fill || d.color }}>{d.payload.name ?? d.payload.day ?? d.payload.hour}</p>
      <p className="text-sm">{val.toLocaleString()} <span className="text-muted-foreground text-xs">users</span></p>
      <p className="text-xs text-muted-foreground">{pct}% of total</p>
    </div>
  )
}

// Custom tooltip for line chart
function LineTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null
  const val = payload[0].value as number
  return (
    <div style={TT_STYLE}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-sm">{val.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">new signups</span></p>
    </div>
  )
}

// Custom tooltip for pie chart
function PieTooltip({ active, payload, total }: { active?: boolean; payload?: any[]; total: number }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  const val = d.value as number
  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0"
  return (
    <div style={TT_STYLE}>
      <p className="font-semibold mb-1" style={{ color: d.payload.fill }}>{d.name}</p>
      <p className="text-sm">{val.toLocaleString()} <span className="text-xs text-muted-foreground">users</span></p>
      <p className="text-xs text-muted-foreground">{pct}% of total</p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 mb-3">
      {children}
    </p>
  )
}

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-border/40">
        <p className="text-sm font-medium">{title}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <div className="px-4 pb-4 pt-3">{children}</div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)]">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">{label}</p>
      <p className="text-[28px] font-bold tracking-tight leading-none">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  )
}

interface AuthUser {
  id: string
  created_at: string
  provider: string
  confirmed: boolean
  profile_started?: boolean
  onboarding_complete?: boolean
  has_applied?: boolean
  heard_about_us?: string | null
}

type TimeRange = "30d" | "all"

export function MarketingScreen() {
  const [refreshing, setRefreshing] = useState(false)
  const [qrRefreshKey, setQrRefreshKey] = useState(0)
  const [timeRange, setTimeRange] = useState<TimeRange>("30d")

  // No demo fallbacks anywhere below: on failure the page says so instead of
  // showing invented numbers.
  const { data: loadedUsers, error: usersError, isLoading: loading, refresh: reloadUsers } = useApi<AuthUser[]>("/api/users?funnel=1")
  const users = useMemo(() => loadedUsers ?? [], [loadedUsers])
  const loadError = !loadedUsers && usersError ? usersError.message : null

  const filteredUsers = useMemo(() => {
    if (timeRange === "all") return users
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    return users.filter(u => new Date(u.created_at) >= cutoff)
  }, [users, timeRange])

  const handleRefresh = async () => {
    setRefreshing(true)
    setQrRefreshKey((k) => k + 1)
    await reloadUsers()
    setRefreshing(false)
  }

  // ── Referral source breakdown ──────────────────────────────────────────────
  const referralData = useMemo(() => {
    const map = new Map<string, number>()
    for (const u of filteredUsers) {
      const src = heardAboutLabel(u.heard_about_us)
      if (src) map.set(src, (map.get(src) || 0) + 1)
    }
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
    return entries.map(([name, value]) => ({ name, value }))
  }, [filteredUsers])

  // ── Signups by hour of day ─────────────────────────────────────────────────
  const signupsByHour = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i === 0 ? "12am" : i < 12 ? `${i}am` : i === 12 ? "12pm" : `${i - 12}pm`,
      count: 0,
    }))
    for (const u of filteredUsers) {
      hours[new Date(u.created_at).getUTCHours()].count++
    }
    return hours
  }, [filteredUsers])

  // ── Signups by day of week ─────────────────────────────────────────────────
  const signupsByDay = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => ({ day: d, count: 0 }))
    for (const u of filteredUsers) {
      days[new Date(u.created_at).getUTCDay()].count++
    }
    return days
  }, [filteredUsers])

  // ── User growth (weekly buckets) ──────────────────────────────────────────
  const weeklyGrowth = useMemo(() => {
    const weeks: { week: string; signups: number }[] = []
    const now = new Date()
    if (timeRange === "all" && users.length) {
      const earliest = users.reduce((min, u) => {
        const d = new Date(u.created_at)
        return d < min ? d : min
      }, new Date())
      const msPerWeek = 7 * 24 * 60 * 60 * 1000
      const numWeeks = Math.max(Math.ceil((now.getTime() - earliest.getTime()) / msPerWeek), 1)
      for (let i = numWeeks - 1; i >= 0; i--) {
        const end = new Date(now.getTime() - i * msPerWeek)
        const start = new Date(end.getTime() - msPerWeek)
        const label = start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        const count = users.filter(u => { const d = new Date(u.created_at); return d >= start && d <= end }).length
        weeks.push({ week: label, signups: count })
      }
    } else {
      for (let i = 4; i >= 0; i--) {
        const end = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)
        const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
        const label = start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        const count = filteredUsers.filter(u => { const d = new Date(u.created_at); return d > start && d <= end }).length
        weeks.push({ week: label, signups: count })
      }
    }
    return weeks
  }, [filteredUsers, users, timeRange])

  // ── Daily signups ──────────────────────────────────────────────────────────
  const dailySignups = useMemo(() => {
    const map = new Map<string, number>()
    for (const u of filteredUsers) {
      const day = u.created_at.slice(0, 10)
      map.set(day, (map.get(day) || 0) + 1)
    }
    const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([raw, count]) => {
      const d = new Date(raw)
      return {
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        fullDate: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        dow: DAYS[d.getUTCDay()],
        count,
        raw,
      }
    })
  }, [filteredUsers])

  const todayStr = new Date().toISOString().slice(0, 10)
  const thisMonthStr = new Date().toISOString().slice(0, 7)
  const todaySignups = useMemo(() => filteredUsers.filter(u => u.created_at.slice(0, 10) === todayStr).length, [filteredUsers, todayStr])
  const monthSignups = useMemo(() => filteredUsers.filter(u => u.created_at.slice(0, 7) === thisMonthStr).length, [filteredUsers, thisMonthStr])

  // ── Auth provider breakdown ────────────────────────────────────────────────
  const providerData = useMemo(() => {
    const map = new Map<string, number>()
    for (const u of filteredUsers) {
      const p = u.provider || "email"
      map.set(p, (map.get(p) || 0) + 1)
    }
    return [...map.entries()].map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }))
  }, [filteredUsers])

  // ── Onboarding funnel ──────────────────────────────────────────────────────
  const total = filteredUsers.length
  const countWhere = (pred: (u: AuthUser) => boolean | undefined) => filteredUsers.filter(pred).length
  const funnelData = [
    { name: "Signed Up", value: total, fill: COLORS[0] },
    { name: "Email Confirmed", value: countWhere(u => u.confirmed), fill: COLORS[1] },
    { name: "Profile Started", value: countWhere(u => u.profile_started), fill: COLORS[2] },
    { name: "Profile Complete", value: countWhere(u => u.onboarding_complete), fill: COLORS[3] },
    { name: "First Job Applied", value: countWhere(u => u.has_applied), fill: COLORS[4] },
  ]

  const pct = (n: number) => percentOf(n, total)
  const confirmedPct = pct(funnelData[1].value)

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gradient">Marketing</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">User acquisition, global download QR, signup trends & onboarding funnel</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
            <button
              onClick={() => setTimeRange("30d")}
              className={`px-3 h-7 text-xs transition-colors ${timeRange === "30d" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            >
              Last 30d
            </button>
            <button
              onClick={() => setTimeRange("all")}
              className={`px-3 h-7 text-xs transition-colors ${timeRange === "all" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            >
              All Time
            </button>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-border/60" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Bangalore QR / download.nextquark.in — loads independently of user stats */}
      <div>
        <SectionLabel>Link &amp; QR visits</SectionLabel>
        <BangaloreQrAnalytics refreshKey={qrRefreshKey} range={timeRange} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load signup data: {loadError}. Charts below are empty until it loads — hit Refresh to retry.
        </div>
      )}
      {/* KPI strip */}
      <div>
        <SectionLabel>Overview</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={timeRange === "all" ? "Total Users" : "Users (30d)"} value={loadError ? "—" : filteredUsers.length} sub={timeRange === "all" ? "all time signups" : "last 30 days"} />
          <StatCard label="Email Confirmed" value={loadError ? "—" : `${confirmedPct}%`} sub="of all signups" />
          <StatCard label="Profile Complete" value={loadError ? "—" : `${pct(funnelData[3].value)}%`} sub="completed onboarding" />
          <StatCard label="Activation Rate" value={loadError ? "—" : `${pct(funnelData[4].value)}%`} sub="applied to ≥1 job" />
        </div>
      </div>

      {/* Acquisition */}
      <div>
        <SectionLabel>Acquisition</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Where did you hear about us */}
          <ChartCard title="Where did you hear about us?" sub={`${referralData.reduce((s, d) => s + d.value, 0).toLocaleString()} responses`}>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={referralData} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip content={<BarTooltip total={referralData.reduce((s, d) => s + d.value, 0)} />} cursor={{ fill: "oklch(1 0 0 / 0.04)" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: "oklch(0.6 0.01 265)", formatter: (v: number) => v.toLocaleString() }}>
                    {referralData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Auth provider */}
          <ChartCard title="Sign-up method" sub="how users authenticated">
            <div className="h-56 flex items-center gap-2">
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie data={providerData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={48} paddingAngle={3}
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                      const RADIAN = Math.PI / 180
                      const r = innerRadius + (outerRadius - innerRadius) * 0.5
                      const x = cx + r * Math.cos(-midAngle * RADIAN)
                      const y = cy + r * Math.sin(-midAngle * RADIAN)
                      return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>{value}</text>
                    }}
                    labelLine={false}
                  >
                    {providerData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<PieTooltip total={providerData.reduce((s, d) => s + d.value, 0)} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                {providerData.map((d, i) => {
                  const total = providerData.reduce((s, x) => s + x.value, 0)
                  const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0"
                  return (
                    <div key={d.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-xs text-muted-foreground">{d.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold tabular-nums">{d.value.toLocaleString()}</span>
                          <span className="text-[10px] text-muted-foreground w-9 text-right">{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-accent/30 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Signup timing */}
      <div>
        <SectionLabel>Signup Timing</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* By day of week */}
          <ChartCard title="Signups by day of week" sub="which days users sign up most">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signupsByDay} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<BarTooltip total={signupsByDay.reduce((s, d) => s + d.count, 0)} />} cursor={{ fill: "oklch(1 0 0 / 0.04)" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 10, fill: "oklch(0.6 0.01 265)" }}>
                    {signupsByDay.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* By hour of day */}
          <ChartCard title="Signups by hour of day" sub="UTC — peak activity window">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signupsByHour} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 8, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} interval={3} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<BarTooltip total={signupsByHour.reduce((s, d) => s + d.count, 0)} />} cursor={{ fill: "oklch(1 0 0 / 0.04)" }} />
                  <ReferenceLine y={Math.max(...signupsByHour.map(h => h.count))} stroke="oklch(0.7 0.18 270 / 0.3)" strokeDasharray="4 4" />
                  <Bar dataKey="count" fill="oklch(0.65 0.15 250)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Daily Signups */}
      <div>
        <SectionLabel>Daily Signups</SectionLabel>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard label="Today" value={loadError ? "—" : todaySignups} sub="signups so far today" />
          <StatCard label="This Month" value={loadError ? "—" : monthSignups} sub={new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} />
        </div>
        <ChartCard title="Daily new signups" sub={timeRange === "all" ? "all time — scroll to see every day" : "last 30 days — scroll to see every day"}>
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" }}>
            <div style={{ width: Math.max(dailySignups.length * 52, 400), height: 220 }}>
              <BarChart
                width={Math.max(dailySignups.length * 52, 400)}
                height={220}
                data={dailySignups}
                margin={{ top: 8, right: 16, left: 0, bottom: 32 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={48}
                />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={TT_STYLE}>
                        <p className="font-semibold mb-0.5" style={{ color: COLORS[2] }}>{d.fullDate}</p>
                        <p className="text-[11px] text-muted-foreground mb-1">{d.dow}</p>
                        <p className="text-sm">{d.count} <span className="text-xs text-muted-foreground">signups</span></p>
                      </div>
                    )
                  }}
                  cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
                />
                <Bar dataKey="count" fill={COLORS[2]} radius={[3, 3, 0, 0]}
                  label={{ position: "top", fontSize: 10, fill: "oklch(0.6 0.01 265)", formatter: (v: number) => v > 0 ? v : "" }}
                />
              </BarChart>
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Growth */}
      <div>
        <SectionLabel>Growth</SectionLabel>
        <ChartCard title="Weekly new signups" sub={timeRange === "all" ? "all time — new users per week" : "last 5 weeks — new users per week"}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyGrowth} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<LineTooltip />} cursor={{ stroke: "oklch(0.7 0.18 270 / 0.2)", strokeWidth: 1 }} />
                <Line
                  type="monotone" dataKey="signups" stroke={COLORS[0]} strokeWidth={2.5}
                  dot={{ r: 4, fill: COLORS[0], strokeWidth: 2, stroke: "oklch(0.13 0.006 265)" }}
                  activeDot={{ r: 6, fill: COLORS[0], stroke: "oklch(0.13 0.006 265)", strokeWidth: 2 }}
                  label={{ position: "top", fontSize: 10, fill: "oklch(0.6 0.01 265)", dy: -4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Onboarding funnel */}
      <div>
        <SectionLabel>Onboarding Funnel</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Visual funnel bars */}
          <ChartCard title="Completion steps" sub="drop-off at each onboarding stage">
            <div className="flex flex-col gap-3 py-1">
              {funnelData.map((step, i) => {
                const pct = percentOf(step.value, funnelData[0].value)
                const dropPct = i > 0 ? percentOf(funnelData[i - 1].value - step.value, funnelData[i - 1].value) : null
                return (
                  <div key={step.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{step.name}</span>
                      <div className="flex items-center gap-2">
                        {dropPct !== null && (
                          <span className="text-[10px] text-destructive/70 tabular-nums">-{dropPct}%</span>
                        )}
                        <span className="text-xs font-semibold tabular-nums">{step.value.toLocaleString()}</span>
                        <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-accent/30 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: step.fill }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </ChartCard>

          {/* Funnel chart */}
          <ChartCard title="Funnel visualisation" sub="proportional drop-off view">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      const pct = percentOf(d.value, funnelData[0].value)
                      return (
                        <div style={TT_STYLE}>
                          <p className="font-semibold mb-1" style={{ color: d.fill }}>{d.name}</p>
                          <p className="text-sm">{d.value.toLocaleString()} <span className="text-xs text-muted-foreground">users</span></p>
                          <p className="text-xs text-muted-foreground">{pct}% of signups</p>
                        </div>
                      )
                    }}
                  />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive>
                    <LabelList position="right" fill="oklch(0.7 0.01 265)" style={{ fontSize: 10 }} dataKey="name" />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </div>
        </>
      )}
    </div>
  )
}

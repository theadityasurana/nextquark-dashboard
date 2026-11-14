"use client"

import { useState, useMemo } from "react"
import { useApi } from "@/lib/api-cache"
import { heardAboutLabel, percentOf } from "@/lib/marketing"
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"
import { RefreshCw, UserPlus, CalendarDays, MailCheck, Rocket } from "lucide-react"
import {
  PageHeader, Panel, PanelHeader, Section, StatCard, KpiGrid, Meter, Segmented, Sparkline,
  chartTooltip, axisTick, gridStroke, SERIES,
} from "@/components/ui/dashboard"
import { Button } from "@/components/ui/button"
import { BangaloreQrAnalytics } from "@/components/bangalore-qr-analytics"

const TT_STYLE = chartTooltip

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
  "color-mix(in oklch, var(--chart-1) 55%, var(--background))",
  "color-mix(in oklch, var(--chart-3) 55%, var(--background))",
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

  const maxDow = Math.max(0, ...signupsByDay.map(d => d.count))
  const maxHour = Math.max(0, ...signupsByHour.map(h => h.count))
  const referralTotal = referralData.reduce((s, d) => s + d.value, 0)
  const referralMax = Math.max(1, ...referralData.map(d => d.value))
  const providerTotal = providerData.reduce((s, d) => s + d.value, 0)
  const lastWeek = weeklyGrowth[weeklyGrowth.length - 1]?.signups ?? 0
  const prevWeek = weeklyGrowth[weeklyGrowth.length - 2]?.signups ?? 0
  const wow = prevWeek > 0 ? Math.round(((lastWeek - prevWeek) / prevWeek) * 100) : null
  const dash = (v: React.ReactNode) => (loadError ? "—" : v)

  return (
    <div className="flex flex-col gap-10 min-w-0 overflow-x-hidden">
      <PageHeader
        title="Marketing"
        description="Acquisition, signup trends, activation and link & QR traffic."
        actions={
          <>
            <Segmented value={timeRange} onChange={setTimeRange} options={[{ value: "30d", label: "Last 30 days" }, { value: "all", label: "All time" }]} />
            <Button size="sm" variant="outline" className="gap-2" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="panel h-36 shimmer" />)}
          </div>
          <div className="panel h-80 shimmer" />
        </div>
      ) : (
        <>
      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load signup data: {loadError}. Charts below are empty until it loads — hit Refresh to retry.
        </div>
      )}

      <KpiGrid>
        <StatCard
          label={timeRange === "all" ? "Total signups" : "Signups · 30 days"}
          value={dash(filteredUsers.length)}
          icon={UserPlus}
          delta={wow === null || loadError ? undefined : `${wow >= 0 ? "+" : ""}${wow}% WoW`}
          deltaTone={wow === null ? "neutral" : wow >= 0 ? "positive" : "negative"}
        >
          <div className="-mx-1 h-10"><Sparkline id="signups" data={dailySignups} /></div>
        </StatCard>
        <StatCard label="Today" value={dash(todaySignups)} icon={CalendarDays}
          footnote={`${monthSignups.toLocaleString()} so far in ${new Date().toLocaleDateString("en-US", { month: "long" })}`} />
        <StatCard label="Email confirmed" value={dash(`${confirmedPct}%`)} icon={MailCheck} footnote={`${funnelData[1].value.toLocaleString()} of ${total.toLocaleString()} signups`}>
          <Meter value={Number(confirmedPct) || 0} tone="success" />
        </StatCard>
        <StatCard label="Activation rate" value={dash(`${pct(funnelData[4].value)}%`)} icon={Rocket} footnote="applied to at least one job">
          <Meter value={Number(pct(funnelData[4].value)) || 0} />
        </StatCard>
      </KpiGrid>

      <Section title="Signups" description={timeRange === "all" ? "Every day since launch" : "Daily signups over the last 30 days"}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader title="Daily new signups" description={`${filteredUsers.length.toLocaleString()} in range · peak ${Math.max(0, ...dailySignups.map(d => d.count))} in a day`} />
            <div className="h-72 px-3 pb-3 pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySignups} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} tickMargin={8} minTickGap={24} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "color-mix(in oklch, var(--foreground) 5%, transparent)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div style={TT_STYLE}>
                          <p className="text-xs text-muted-foreground">{d.dow}, {d.fullDate}</p>
                          <p className="mt-0.5 text-sm font-semibold">{d.count} <span className="text-xs font-normal text-muted-foreground">signups</span></p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Weekly signups" description={timeRange === "all" ? "New users per week" : "Last 5 weeks"} />
            <div className="px-5 pt-4">
              <p className="num text-2xl font-semibold">{lastWeek.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">this week{wow !== null && <span className={wow >= 0 ? " text-success" : " text-destructive"}> · {wow >= 0 ? "+" : ""}{wow}%</span>}</p>
            </div>
            <div className="h-48 px-3 pb-3 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyGrowth} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="week" tick={axisTick} axisLine={false} tickLine={false} tickMargin={8} minTickGap={16} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <Tooltip content={<LineTooltip />} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
                  <Area type="monotone" dataKey="signups" stroke="var(--chart-1)" strokeWidth={2} fill="url(#wk)" dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </Section>

      <Section title="Activation funnel" description="Where new users drop off between signup and their first application">
        <Panel>
          <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-5 md:divide-x md:divide-y-0">
            {funnelData.map((step, i) => {
              const ofTotal = percentOf(step.value, funnelData[0].value)
              const dropPct = i > 0 ? percentOf(funnelData[i - 1].value - step.value, funnelData[i - 1].value) : null
              return (
                <div key={step.name} className="flex flex-col gap-3 px-5 py-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">{i + 1}</span>
                      {step.name}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="num text-2xl font-semibold">{dash(step.value.toLocaleString())}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{ofTotal}%</span>
                  </div>
                  <div className="h-16 w-full overflow-hidden rounded-md bg-muted/60">
                    <div className="h-full w-full origin-bottom rounded-md bg-primary transition-transform duration-500"
                      style={{ transform: `scaleY(${Math.max(0.02, Number(ofTotal) / 100)})`, opacity: 1 - i * 0.14 }} />
                  </div>
                  <span className={`text-[11px] tabular-nums ${dropPct === null ? "text-muted-foreground" : "text-destructive"}`}>
                    {dropPct === null ? "Starting point" : `−${dropPct}% from previous step`}
                  </span>
                </div>
              )
            })}
          </div>
        </Panel>
      </Section>

      <Section title="Acquisition" description="How people found Iris and how they signed up">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Where did you hear about us?" description={`${referralTotal.toLocaleString()} survey responses`} />
            <div className="flex flex-col gap-3 px-5 py-5">
              {referralData.length === 0 && <p className="text-xs text-muted-foreground">No responses yet</p>}
              {referralData.map((d) => (
                <div key={d.name} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-[13px]">{d.name}</span>
                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted/60">
                    <div className="h-full rounded-md bg-chart-1" style={{ width: `${(d.value / referralMax) * 100}%`, opacity: 0.35 + 0.65 * (d.value / referralMax) }} />
                  </div>
                  <span className="num w-12 shrink-0 text-right text-[13px] font-medium">{d.value.toLocaleString()}</span>
                  <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{referralTotal ? Math.round((d.value / referralTotal) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Sign-up method" description="How users authenticated" />
            <div className="flex items-center gap-6 px-5 py-6">
              <div className="relative h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={providerData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={74} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                      {providerData.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip total={providerTotal} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="num text-xl font-semibold">{providerTotal.toLocaleString()}</span>
                  <span className="text-[11px] text-muted-foreground">users</span>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                {providerData.map((d, i) => {
                  const share = providerTotal > 0 ? (d.value / providerTotal) * 100 : 0
                  return (
                    <div key={d.name} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 text-muted-foreground"><span className="h-2 w-2 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />{d.name}</span>
                        <span className="num font-medium">{d.value.toLocaleString()} <span className="font-normal text-muted-foreground">· {share.toFixed(1)}%</span></span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: SERIES[i % SERIES.length] }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Panel>
        </div>
      </Section>

      <Section title="Signup timing" description="When people sign up — the busiest slot is highlighted">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="By day of week" />
            <div className="h-56 px-3 pb-3 pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signupsByDay} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="day" tick={axisTick} axisLine={false} tickLine={false} tickMargin={8} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <Tooltip content={<BarTooltip total={signupsByDay.reduce((s, d) => s + d.count, 0)} />} cursor={{ fill: "color-mix(in oklch, var(--foreground) 5%, transparent)" }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {signupsByDay.map((d, i) => <Cell key={i} fill={d.count === maxDow ? "var(--chart-1)" : "color-mix(in oklch, var(--chart-1) 35%, transparent)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="By hour of day" description="UTC" />
            <div className="h-56 px-3 pb-3 pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={signupsByHour} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="hour" tick={axisTick} axisLine={false} tickLine={false} tickMargin={8} interval={3} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <Tooltip content={<BarTooltip total={signupsByHour.reduce((s, d) => s + d.count, 0)} />} cursor={{ fill: "color-mix(in oklch, var(--foreground) 5%, transparent)" }} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {signupsByHour.map((h, i) => <Cell key={i} fill={h.count === maxHour ? "var(--chart-1)" : "color-mix(in oklch, var(--chart-1) 35%, transparent)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </Section>
        </>
      )}

      <Section title="Link & QR visits" description="Traffic to irisjobs.live, download.nextquark.in and the QR code">
        <BangaloreQrAnalytics refreshKey={qrRefreshKey} range={timeRange} />
      </Section>
    </div>
  )
}

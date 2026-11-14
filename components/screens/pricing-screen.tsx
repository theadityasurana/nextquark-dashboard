"use client"

import { useState } from "react"
import useSWR from "swr"
import { formatCost } from "@/lib/run-cost"
import { PLANS } from "@/lib/plans"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip,
  PieChart, Pie, CartesianGrid,
} from "recharts"
import { DollarSign, IndianRupee, Users, TrendingUp } from "lucide-react"
import {
  PageHeader, Panel, PanelHeader, Section, StatCard, KpiGrid, MiniStat, Meter, EmptyState, Segmented, Avatar,
  chartTooltip, axisTick, gridStroke, SERIES,
} from "@/components/ui/dashboard"

// ── Pricing — from lib/plans.ts, which mirrors the app's PLAN_CONFIGS ────────
// (subscription_plan = starter | pro | ultra; monthly or quarterly).
const INTL = PLANS.map((p) => ({ id: p.id, label: p.label, monthly: p.INTL.monthly, quarterly: p.INTL.quarterly, credits: p.credits }))
const IN   = PLANS.map((p) => ({ id: p.id, label: p.label, monthly: p.IN.monthly,   quarterly: p.IN.quarterly,   credits: p.credits }))
const INTL_MAP: Record<string, (typeof INTL)[number]> = Object.fromEntries(INTL.map((p) => [p.id, p]))
const IN_MAP: Record<string, (typeof IN)[number]>     = Object.fromEntries(IN.map((p) => [p.id, p]))

const PC: Record<string, string> = {
  free: "var(--muted-foreground)", starter: "var(--chart-2)", pro: "var(--chart-1)", ultra: "var(--chart-3)",
}

const TT = chartTooltip

const APPLE_FEE   = 0.30
const GOOGLE_FEE  = 0.15
const MONTHLY_INFRA = 75
const COST_PER_APP  = 0.02

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function fmtUSD(v: number) {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtINR(v: number) {
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Stats {
  total: number; paid: number; free: number
  planCounts: Record<string, number>
  inCounts: Record<string, number>
  intlCounts: Record<string, number>
  monthlyCount: number; quarterlyCount: number
  lapsed: number; cancelledInTerm: number
  mrrUSD: number; mrrINR: number
}
interface PaidUser {
  id: string; email: string; full_name: string | null
  subscription_type: string | null
  plan: string | null
  state: "active" | "cancelled" | "grace" | "lapsed" | "free"
  subscription_start_date: string | null
  subscription_end_date: string | null
  region: "IN" | "INTL"; billing_period: "monthly" | "quarterly"; platform: string | null
  monthly_revenue: number
}
interface CostStats {
  totalCost: number; billedRuns: number; totalSeconds: number
  costPerApplication: number; averageSeconds: number
  completedCost: number; completedRuns: number; costPerCompleted: number
}

function PlanTable({ plans, counts, fmt, free }: {
  plans: typeof INTL; counts: Record<string, number>
  fmt: (v: number) => string; free: number
}) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[480px] text-sm">
      <thead>
        <tr className="border-b border-border bg-muted/40">
          <th className="eyebrow text-left px-5 py-2.5">Plan</th>
          <th className="eyebrow text-right px-4 py-2.5">Monthly</th>
          <th className="eyebrow text-right px-4 py-2.5">Quarterly</th>
          <th className="eyebrow text-right px-4 py-2.5">Credits</th>
          <th className="eyebrow text-right px-5 py-2.5">Subscribers</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {plans.map((p) => (
          <tr key={p.id} className="hover:bg-muted/40 transition-colors">
            <td className="px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PC[p.id] }} />
                <span className="font-medium">{p.label}</span>
                <span className="text-[10px] text-muted-foreground">({p.id})</span>
              </div>
            </td>
            <td className="text-right px-4 py-3 tabular-nums">{fmt(p.monthly)}</td>
            <td className="text-right px-4 py-3 tabular-nums text-muted-foreground">{fmt(p.quarterly)}</td>
            <td className="text-right px-4 py-3 tabular-nums text-muted-foreground">{p.credits}</td>
            <td className="text-right px-5 py-3 font-semibold tabular-nums">{counts[p.id] ?? 0}</td>
          </tr>
        ))}
        <tr className="bg-muted/20">
          <td className="px-5 py-3">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PC.free }} />
              <span className="font-medium">Free</span>
            </div>
          </td>
          <td className="text-right px-4 py-3 text-muted-foreground">—</td>
          <td className="text-right px-4 py-3 text-muted-foreground">—</td>
          <td className="text-right px-4 py-3 tabular-nums text-muted-foreground">10</td>
          <td className="text-right px-5 py-3 font-semibold tabular-nums">{free}</td>
        </tr>
      </tbody>
    </table>
    </div>
  )
}

export function PricingScreen() {
  const { data: stats, isLoading } = useSWR<Stats>("/api/pricing", fetcher, { revalidateOnFocus: false })
  const { data: rawPaid } = useSWR<PaidUser[]>("/api/pricing/paid", fetcher, { revalidateOnFocus: false })
  const paidUsers = Array.isArray(rawPaid) ? rawPaid : []
  const { data: cost } = useSWR<CostStats>("/api/pricing/cost", fetcher, { revalidateOnFocus: false })

  const total      = stats?.total ?? 0
  const paid       = stats?.paid ?? 0
  const free       = stats?.free ?? 0
  const mrrUSD     = stats?.mrrUSD ?? 0
  const mrrINR     = stats?.mrrINR ?? 0
  const planCounts = stats?.planCounts ?? {}
  const inCounts   = stats?.inCounts ?? {}
  const intlCounts = stats?.intlCounts ?? {}
  const paidPct    = total > 0 ? ((paid / total) * 100).toFixed(1) : "0"

  // Paying now (lapsed rows are listed below but earn nothing).
  const paying     = paidUsers.filter((u) => u.state !== "lapsed" && u.state !== "free")
  const applePaid  = paying.filter((u) => u.platform === "ios").length
  const googlePaid = paying.filter((u) => u.platform === "android").length
  const quarterlyPaid = stats?.quarterlyCount ?? paying.filter((u) => u.billing_period === "quarterly").length
  const monthlyPaid = paid - quarterlyPaid
  const inPaid     = paying.filter((u) => u.region === "IN").length
  const intlPaid   = paid - inPaid
  const revenueOf = (region: "IN" | "INTL", plan: string) =>
    paying.filter((u) => u.region === region && u.plan === plan).reduce((sum, u) => sum + (u.monthly_revenue ?? 0), 0)

  const appleFees  = (applePaid  / Math.max(paid, 1)) * mrrUSD * APPLE_FEE
  const googleFees = (googlePaid / Math.max(paid, 1)) * mrrUSD * GOOGLE_FEE
  const automationCost = (cost?.billedRuns ?? 0) * COST_PER_APP
  const netMargin  = mrrUSD - appleFees - googleFees - MONTHLY_INFRA - automationCost

  // INTL bar data
  const intlSubBar = INTL.map((p) => ({ name: p.label, users: intlCounts[p.id] ?? 0, color: PC[p.id] }))
  const intlRevBar = INTL.map((p) => ({ name: p.label, revenue: revenueOf("INTL", p.id), color: PC[p.id] }))

  // IN bar data
  const inSubBar = IN.map((p) => ({ name: p.label, users: inCounts[p.id] ?? 0, color: PC[p.id] }))
  const inRevBar = IN.map((p) => ({ name: p.label, revenue: revenueOf("IN", p.id), color: PC[p.id] }))

  // Donut: all plans combined
  const donutData = [
    { name: "Free", value: free, color: PC.free },
    ...PLANS.map((p) => p.id)
      .filter((id) => (planCounts[id] ?? 0) > 0)
      .map((id) => ({ name: id.charAt(0).toUpperCase() + id.slice(1), value: planCounts[id] ?? 0, color: PC[id] })),
  ]

  const platformData = [
    { name: "Apple",  value: applePaid,  color: "#a78bfa" },
    { name: "Google", value: googlePaid, color: "#34d399" },
    { name: "Other",  value: Math.max(0, paid - applePaid - googlePaid), color: "#6b7280" },
  ].filter((d) => d.value > 0)

  const marginSteps = [
    { name: "Gross",    value: mrrUSD },
    { name: "−Apple",   value: mrrUSD - appleFees },
    { name: "−Google",  value: mrrUSD - appleFees - googleFees },
    { name: "−Infra",   value: mrrUSD - appleFees - googleFees - MONTHLY_INFRA },
    { name: "−Runs",    value: netMargin },
  ]

  const [region, setRegion] = useState<"INTL" | "IN">("INTL")
  const subBar = region === "INTL" ? intlSubBar : inSubBar
  const revBar = region === "INTL" ? intlRevBar : inRevBar
  const fmtRegion = region === "INTL" ? fmtUSD : fmtINR

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-14 w-72 rounded-lg bg-muted/60 shimmer" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="panel h-36 shimmer" />)}
        </div>
        <div className="panel h-80 shimmer" />
      </div>
    )
  }

  const waterfall = [
    { label: "Gross revenue", value: mrrUSD, note: "INTL MRR", tone: "base" as const },
    { label: "Apple fees", value: -appleFees, note: "30% of App Store revenue", tone: "neg" as const },
    { label: "Google fees", value: -googleFees, note: "15% of Play revenue", tone: "neg" as const },
    { label: "Infrastructure", value: -MONTHLY_INFRA, note: "fixed monthly", tone: "neg" as const },
    { label: "Automation runs", value: -automationCost, note: `${cost?.billedRuns ?? 0} billed runs`, tone: "neg" as const },
  ]
  const wfMax = Math.max(1, mrrUSD, Math.abs(netMargin))
  const failedRuns = (cost?.billedRuns ?? 0) - (cost?.completedRuns ?? 0)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Revenue"
        description="Subscriptions, recurring revenue and unit economics across both regions."
      />

      <KpiGrid>
        <StatCard label="MRR · International" value={fmtUSD(mrrUSD)} icon={DollarSign}
          footnote={`ARR ${fmtUSD(mrrUSD * 12)} · ARPU ${fmtUSD(intlPaid > 0 ? mrrUSD / intlPaid : 0)}`} />
        <StatCard label="MRR · India" value={fmtINR(mrrINR)} icon={IndianRupee}
          footnote={`ARR ${fmtINR(mrrINR * 12)} · ARPU ${fmtINR(inPaid > 0 ? mrrINR / inPaid : 0)}`} />
        <StatCard label="Paying subscribers" value={paid} icon={Users}
          delta={`${paidPct}% conversion`} deltaTone="neutral"
          footnote={`${intlPaid} international · ${inPaid} India · ${stats?.lapsed ?? 0} lapsed`}>
          <Meter value={paid} max={Math.max(1, total)} />
        </StatCard>
        <StatCard label="Net margin (est.)" value={fmtUSD(netMargin)} icon={TrendingUp}
          delta={netMargin >= 0 ? "Profitable" : "Below break-even"} deltaTone={netMargin >= 0 ? "positive" : "negative"}
          footnote="INTL MRR after store fees, infra and runs" />
      </KpiGrid>

      <Section
        title="Plans"
        description="Subscribers and monthly revenue by plan"
        actions={<Segmented value={region} onChange={setRegion} options={[{ value: "INTL", label: "International · USD" }, { value: "IN", label: "India · INR" }]} />}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Subscribers per plan" description={`${(region === "INTL" ? intlPaid : inPaid).toLocaleString()} paying in this region`} />
            <div className="h-60 px-3 pb-3 pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subBar} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} tickMargin={8} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                  <Tooltip contentStyle={TT} cursor={{ fill: "color-mix(in oklch, var(--foreground) 4%, transparent)" }} formatter={(v: number) => [v, "Subscribers"]} />
                  <Bar dataKey="users" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {subBar.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Monthly revenue per plan" description={`${fmtRegion(region === "INTL" ? mrrUSD : mrrINR)} MRR in this region`} />
            <div className="h-60 px-3 pb-3 pt-5">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revBar} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} tickMargin={8} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => region === "INTL" ? `$${v}` : `₹${v}`} />
                  <Tooltip contentStyle={TT} cursor={{ fill: "color-mix(in oklch, var(--foreground) 4%, transparent)" }} formatter={(v: number) => [fmtRegion(v), "Revenue"]} />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {revBar.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </Section>

      <Section title="Customer mix" description="How subscribers break down across plan, platform and billing">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[
            { title: "Plan distribution", data: donutData, total: donutData.reduce((n, d) => n + d.value, 0), unit: "users" },
            { title: "Platform", data: platformData.map((d, i) => ({ ...d, color: SERIES[i] })), total: paid, unit: "paying" },
          ].map((chart) => (
            <Panel key={chart.title}>
              <PanelHeader title={chart.title} />
              <div className="flex items-center gap-5 px-5 py-5">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chart.data} innerRadius={44} outerRadius={60} paddingAngle={2} dataKey="value" stroke="none" startAngle={90} endAngle={-270}>
                        {chart.data.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`${v} users`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="num text-lg font-semibold">{chart.total.toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground">{chart.unit}</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {chart.data.length === 0 && <p className="text-xs text-muted-foreground">No data yet</p>}
                  {chart.data.map((d) => (
                    <div key={d.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2 text-muted-foreground"><span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: d.color }} /><span className="truncate">{d.name}</span></span>
                      <span className="num font-medium">{d.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          ))}
          <Panel>
            <PanelHeader title="Billing & region" description="Share of paying subscribers" />
            <div className="flex flex-col gap-4 px-5 py-5">
              {[
                { name: "Monthly", value: monthlyPaid, tone: "primary" as const },
                { name: "Quarterly", value: quarterlyPaid, tone: "warning" as const },
                { name: "International", value: intlPaid, tone: "primary" as const },
                { name: "India", value: inPaid, tone: "success" as const },
              ].map((b) => (
                <div key={b.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{b.name}</span>
                    <span className="num font-medium">{b.value} <span className="font-normal text-muted-foreground">· {paid > 0 ? ((b.value / paid) * 100).toFixed(0) : 0}%</span></span>
                  </div>
                  <Meter value={b.value} max={Math.max(1, paid)} tone={b.tone} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Section>

      <Section title="Unit economics" description="Estimated monthly margin and what automation costs us">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Panel className="lg:col-span-3">
            <PanelHeader title="Margin breakdown · INTL" description="From gross MRR down to estimated net" icon={TrendingUp} />
            <div className="divide-y divide-border">
              {waterfall.map((w) => (
                <div key={w.label} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-36 shrink-0">
                    <p className="text-[13px] font-medium">{w.label}</p>
                    <p className="text-[11px] text-muted-foreground">{w.note}</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${w.tone === "neg" ? "bg-destructive/70" : "bg-chart-1"}`} style={{ width: `${(Math.abs(w.value) / wfMax) * 100}%` }} />
                    </div>
                  </div>
                  <span className={`num w-24 shrink-0 text-right text-[13px] font-medium ${w.tone === "neg" ? "text-destructive" : ""}`}>
                    {w.tone === "neg" ? "−" : ""}{fmtUSD(Math.abs(w.value))}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-4 bg-muted/30 px-5 py-3.5">
                <p className="w-36 shrink-0 text-[13px] font-semibold">Net margin</p>
                <div className="flex-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${netMargin >= 0 ? "bg-success" : "bg-destructive"}`} style={{ width: `${(Math.abs(netMargin) / wfMax) * 100}%` }} />
                  </div>
                </div>
                <span className={`num w-24 shrink-0 text-right text-sm font-semibold ${netMargin >= 0 ? "text-success" : "text-destructive"}`}>{fmtUSD(netMargin)}</span>
              </div>
            </div>
          </Panel>
          <div className="grid grid-cols-2 gap-4 lg:col-span-2">
            <MiniStat label="Total run cost" value={formatCost(cost?.totalCost)} hint={`${cost?.billedRuns ?? 0} runs · ${((cost?.totalSeconds ?? 0) / 60).toFixed(0)} min`} />
            <MiniStat label="Cost / application" value={formatCost(cost?.costPerApplication)} hint={`avg ${(cost?.averageSeconds ?? 0).toFixed(0)}s per run`} />
            <MiniStat label="Cost / completed" value={formatCost(cost?.costPerCompleted)} hint={`${cost?.completedRuns ?? 0} completed`} />
            <MiniStat label="Spent on failures" value={formatCost(cost ? cost.totalCost - cost.completedCost : undefined)} dot="bg-destructive" hint={`${failedRuns} failed runs`} />
          </div>
        </div>
      </Section>

      <Section title="Subscribers" description="Everyone on a paid plan, including lapsed accounts">
        <Panel>
          <PanelHeader title="Paid subscribers" description={`${paid.toLocaleString()} active · ${paidUsers.length.toLocaleString()} listed`} />
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border bg-muted/40">
                  <th className="eyebrow px-5 py-2.5 text-left">Subscriber</th>
                  <th className="eyebrow px-4 py-2.5 text-left">Plan</th>
                  <th className="eyebrow hidden px-4 py-2.5 text-left sm:table-cell">Region</th>
                  <th className="eyebrow hidden px-4 py-2.5 text-left sm:table-cell">Billing</th>
                  <th className="eyebrow hidden px-4 py-2.5 text-left lg:table-cell">Platform</th>
                  <th className="eyebrow hidden px-4 py-2.5 text-right sm:table-cell">Price / mo</th>
                  <th className="eyebrow hidden px-5 py-2.5 text-right md:table-cell">Renews</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paidUsers.map((user) => {
                  const plan    = user.plan ?? "free"
                  const isIN    = user.region === "IN"
                  const planInfo = isIN ? IN_MAP[plan] : INTL_MAP[plan]
                  const listPrice = planInfo ? (user.billing_period === "quarterly" ? planInfo.quarterly / 3 : planInfo.monthly) : 0
                  const price   = planInfo ? (isIN ? fmtINR(listPrice) : fmtUSD(listPrice)) : "—"
                  // Same rule as the app (has_paid_access): "Expired" only once access has really ended.
                  const expired = user.state === "lapsed"
                  return (
                    <tr key={user.id} className="transition-colors hover:bg-muted/40">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={user.full_name || user.email} />
                          <div className="min-w-0">
                            <p className="max-w-[200px] truncate text-[13px] font-medium">{user.full_name || "—"}</p>
                            <p className="max-w-[200px] truncate text-[11px] text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs capitalize"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: PC[plan] ?? PC.free }} />{plan}</span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{user.region === "IN" ? "India" : "International"}</td>
                      <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{user.billing_period === "quarterly" ? "Quarterly" : "Monthly"}</td>
                      <td className="hidden px-4 py-2.5 text-xs capitalize text-muted-foreground lg:table-cell">{user.platform ?? "—"}</td>
                      <td className="num hidden px-4 py-2.5 text-right text-[13px] sm:table-cell">{price}</td>
                      <td className="hidden px-5 py-2.5 text-right md:table-cell">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {user.subscription_end_date ? new Date(user.subscription_end_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                          </span>
                          {expired && <span className="rounded-full border border-destructive/25 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">Expired</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {paidUsers.length === 0 && <EmptyState icon={Users} title="No paid subscribers yet" />}
          </div>
        </Panel>

        <Panel>
          <Tabs defaultValue="intl" className="gap-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Price list</h3>
                <p className="text-xs text-muted-foreground">Current plan pricing from lib/plans.ts</p>
              </div>
              <TabsList>
                <TabsTrigger value="intl" className="px-3 text-xs">International · USD</TabsTrigger>
                <TabsTrigger value="in" className="px-3 text-xs">India · INR</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="intl" className="mt-0">
              <PlanTable plans={INTL} counts={intlCounts} fmt={fmtUSD} free={free} />
            </TabsContent>
            <TabsContent value="in" className="mt-0">
              <PlanTable plans={IN} counts={inCounts} fmt={fmtINR} free={free} />
            </TabsContent>
          </Tabs>
        </Panel>
      </Section>
    </div>
  )
}

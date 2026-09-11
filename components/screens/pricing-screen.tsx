"use client"

import { useState } from "react"
import useSWR from "swr"
import { formatCost } from "@/lib/run-cost"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip,
  PieChart, Pie, Legend, AreaChart, Area, CartesianGrid,
} from "recharts"

// ── Pricing (INTL plan IDs differ from IN plan IDs intentionally) ─────────────
const INTL = [
  { id: "pro",   label: "Starter", monthly: 19.99, annual: 191.88, credits: 75 },
  { id: "power", label: "Pro",     monthly: 39.99, annual: 383.88, credits: 200 },
  { id: "max",   label: "Power",   monthly: 59.99, annual: 575.88, credits: 500 },
]
const IN = [
  { id: "starter", label: "Starter", monthly: 499,  annual: 4790,  credits: 75 },
  { id: "pro",     label: "Pro",     monthly: 999,  annual: 9590,  credits: 200 },
  { id: "power",   label: "Power",   monthly: 2199, annual: 21110, credits: 500 },
]
const INTL_MAP = Object.fromEntries(INTL.map((p) => [p.id, p]))
const IN_MAP   = Object.fromEntries(IN.map((p) => [p.id, p]))

const PC: Record<string, string> = {
  free: "#6b7280", starter: "#22c4ac", pro: "#818cf8", power: "#f59e0b", max: "#f97316",
}

const LEGACY_MAP: Record<string, string> = {
  premium: "pro", nq_premium_monthly: "pro", nq_premium_weekly: "pro",
  nq_pro_monthly: "pro", nq_pro_yearly: "pro",
  nq_power_monthly: "power", nq_power_yearly: "power",
  nq_max_monthly: "max", nq_max_yearly: "max",
  nq_starter_monthly: "starter", nq_starter_yearly: "starter",
}
function canon(sub: string | null | undefined): string {
  if (!sub) return "free"
  return LEGACY_MAP[sub.toLowerCase()] ?? sub.toLowerCase()
}

const TT = {
  backgroundColor: "oklch(0.13 0.006 265)",
  border: "1px solid oklch(0.22 0.008 265)",
  borderRadius: "6px", fontSize: 11,
  color: "oklch(0.92 0.003 265)", padding: "6px 10px",
}

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
  monthlyCount: number; annualCount: number
  mrrUSD: number; mrrINR: number
}
interface PaidUser {
  id: string; email: string; full_name: string | null
  subscription_type: string | null
  subscription_start_date: string | null
  subscription_end_date: string | null
  region: string | null; billing_period: string | null; platform: string | null
}
interface CostStats {
  totalCost: number; billedRuns: number; totalSeconds: number
  costPerApplication: number; averageSeconds: number
  completedCost: number; completedRuns: number; costPerCompleted: number
}

// ── Small reusable components ─────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 mb-3">
      {children}
    </p>
  )
}

function KpiCard({ label, value, sub, accent }: {
  label: string; value: React.ReactNode; sub?: string; accent?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)]">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-[24px] font-bold tracking-tight leading-none ${accent ?? ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  )
}

function PlanTable({ plans, counts, fmt, free }: {
  plans: typeof INTL; counts: Record<string, number>
  fmt: (v: number) => string; free: number
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border/40 text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
          <th className="text-left px-5 py-3">Plan</th>
          <th className="text-right px-4 py-3">Monthly</th>
          <th className="text-right px-4 py-3">Annual</th>
          <th className="text-right px-4 py-3">Credits</th>
          <th className="text-right px-5 py-3">Subscribers</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/30">
        {plans.map((p) => (
          <tr key={p.id} className="hover:bg-accent/20 transition-colors">
            <td className="px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PC[p.id] }} />
                <span className="font-medium">{p.label}</span>
                <span className="text-[10px] text-muted-foreground">({p.id})</span>
              </div>
            </td>
            <td className="text-right px-4 py-3 tabular-nums">{fmt(p.monthly)}</td>
            <td className="text-right px-4 py-3 tabular-nums text-muted-foreground">{fmt(p.annual)}</td>
            <td className="text-right px-4 py-3 tabular-nums text-muted-foreground">{p.credits}</td>
            <td className="text-right px-5 py-3 font-semibold tabular-nums">{counts[p.id] ?? 0}</td>
          </tr>
        ))}
        <tr className="bg-accent/10">
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

  const applePaid  = paidUsers.filter((u) => u.platform === "apple").length
  const googlePaid = paidUsers.filter((u) => u.platform === "google").length
  const annualPaid = paidUsers.filter((u) => u.billing_period === "annual").length
  const monthlyPaid = paid - annualPaid
  const inPaid     = paidUsers.filter((u) => u.region === "IN").length
  const intlPaid   = paid - inPaid

  const appleFees  = (applePaid  / Math.max(paid, 1)) * mrrUSD * APPLE_FEE
  const googleFees = (googlePaid / Math.max(paid, 1)) * mrrUSD * GOOGLE_FEE
  const automationCost = (cost?.billedRuns ?? 0) * COST_PER_APP
  const netMargin  = mrrUSD - appleFees - googleFees - MONTHLY_INFRA - automationCost

  // INTL bar data
  const intlSubBar = INTL.map((p) => ({ name: p.label, users: intlCounts[p.id] ?? 0, color: PC[p.id] }))
  const intlRevBar = INTL.map((p) => ({ name: p.label, revenue: (intlCounts[p.id] ?? 0) * p.monthly, color: PC[p.id] }))

  // IN bar data
  const inSubBar = IN.map((p) => ({ name: p.label, users: inCounts[p.id] ?? 0, color: PC[p.id] }))
  const inRevBar = IN.map((p) => ({ name: p.label, revenue: (inCounts[p.id] ?? 0) * p.monthly, color: PC[p.id] }))

  // Donut: all plans combined
  const donutData = [
    { name: "Free", value: free, color: PC.free },
    ...["starter", "pro", "power", "max"]
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">

      {/* Header — no region toggle, page always shows both */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gradient">Revenue</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Subscription analytics across all regions and plans</p>
      </div>

      {/* ── Overview KPIs ── */}
      <div>
        <SectionLabel>Overview</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total Users"   value={total} />
          <KpiCard label="Paid"          value={paid}  sub={`${paidPct}% conversion`} />
          <KpiCard label="Free"          value={free} />
          <KpiCard label="INTL Paid"     value={intlPaid} sub="USD region" />
          <KpiCard label="IN Paid"       value={inPaid}   sub="INR region" />
          <KpiCard label="Annual Billing" value={annualPaid} sub={`${paid > 0 ? ((annualPaid/paid)*100).toFixed(0) : 0}% of paid`} />
        </div>
      </div>

      {/* ── Revenue KPIs — both regions side by side ── */}
      <div>
        <SectionLabel>Revenue</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="MRR · INTL (USD)" value={fmtUSD(mrrUSD)} sub={`ARR ${fmtUSD(mrrUSD * 12)}`} />
          <KpiCard label="MRR · IN (INR)"   value={fmtINR(mrrINR)} sub={`ARR ${fmtINR(mrrINR * 12)}`} />
          <KpiCard label="ARPU · INTL"      value={fmtUSD(intlPaid > 0 ? mrrUSD / intlPaid : 0)} sub="per paid INTL user" />
          <KpiCard label="ARPU · IN"        value={fmtINR(inPaid  > 0 ? mrrINR / inPaid  : 0)} sub="per paid IN user" />
        </div>
      </div>

      {/* ── Plan breakdown: INTL (USD) ── */}
      <div>
        <SectionLabel>Plan breakdown · INTL (USD)</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
            <div className="px-5 pt-4 pb-1 border-b border-border/40">
              <p className="text-sm font-medium">Subscribers per plan</p>
            </div>
            <div className="h-52 px-2 pt-4 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={intlSubBar} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 265)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.01 265)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TT} cursor={{ fill: "oklch(1 0 0 / 0.03)" }} formatter={(v: number) => [v, "Subscribers"]} />
                  <Bar dataKey="users" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {intlSubBar.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
            <div className="px-5 pt-4 pb-1 border-b border-border/40">
              <p className="text-sm font-medium">Monthly revenue per plan (USD)</p>
            </div>
            <div className="h-52 px-2 pt-4 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={intlRevBar} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 265)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.01 265)" }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={TT} cursor={{ fill: "oklch(1 0 0 / 0.03)" }} formatter={(v: number) => [fmtUSD(v), "Revenue"]} />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {intlRevBar.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── Plan breakdown: IN (INR) ── */}
      <div>
        <SectionLabel>Plan breakdown · IN (INR)</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
            <div className="px-5 pt-4 pb-1 border-b border-border/40">
              <p className="text-sm font-medium">Subscribers per plan</p>
            </div>
            <div className="h-52 px-2 pt-4 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inSubBar} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 265)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.01 265)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={TT} cursor={{ fill: "oklch(1 0 0 / 0.03)" }} formatter={(v: number) => [v, "Subscribers"]} />
                  <Bar dataKey="users" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {inSubBar.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
            <div className="px-5 pt-4 pb-1 border-b border-border/40">
              <p className="text-sm font-medium">Monthly revenue per plan (INR)</p>
            </div>
            <div className="h-52 px-2 pt-4 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inRevBar} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "oklch(0.55 0.01 265)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.01 265)" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip contentStyle={TT} cursor={{ fill: "oklch(1 0 0 / 0.03)" }} formatter={(v: number) => [fmtINR(v), "Revenue"]} />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {inRevBar.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── Distribution ── */}
      <div>
        <SectionLabel>Distribution</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
            <div className="px-5 pt-4 pb-1 border-b border-border/40">
              <p className="text-sm font-medium">Plan distribution (all regions)</p>
            </div>
            <div className="h-52 px-2 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="40%" cy="50%" innerRadius={48} outerRadius={74} paddingAngle={3} dataKey="value" stroke="none">
                    {donutData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`${v} users`, n]} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
                    formatter={(v) => <span style={{ fontSize: 11, color: "oklch(0.70 0.01 265)" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
            <div className="px-5 pt-4 pb-1 border-b border-border/40">
              <p className="text-sm font-medium">Platform split</p>
            </div>
            <div className="h-52 px-2 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={platformData} cx="40%" cy="50%" innerRadius={48} outerRadius={74} paddingAngle={3} dataKey="value" stroke="none">
                    {platformData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TT} formatter={(v: number, n: string) => [`${v} users`, n]} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
                    formatter={(v) => <span style={{ fontSize: 11, color: "oklch(0.70 0.01 265)" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
            <div className="px-5 pt-4 pb-1 border-b border-border/40">
              <p className="text-sm font-medium">Billing period split</p>
            </div>
            <div className="h-52 px-4 pt-5 pb-3 flex flex-col gap-4 justify-center">
              {[
                { name: "Monthly", value: monthlyPaid, color: "#818cf8" },
                { name: "Annual",  value: annualPaid,  color: "#f59e0b" },
                { name: "INTL",    value: intlPaid,    color: "#f97316" },
                { name: "IN",      value: inPaid,      color: "#22c4ac" },
              ].map((b) => (
                <div key={b.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{b.name}</span>
                    <span className="font-semibold tabular-nums">
                      {b.value}
                      <span className="text-muted-foreground font-normal ml-1">
                        ({paid > 0 ? ((b.value / paid) * 100).toFixed(0) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-accent/30 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{ width: paid > 0 ? `${(b.value / paid) * 100}%` : "0%", backgroundColor: b.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Margin waterfall (USD only) ── */}
      <div>
        <SectionLabel>Margin waterfall · INTL (USD)</SectionLabel>
        <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-border/40">
            {[
              { label: "Gross Revenue",  value: fmtUSD(mrrUSD),                         sub: "INTL MRR" },
              { label: "− Apple Fees",   value: fmtUSD(appleFees),                      sub: "30% cut", neg: true },
              { label: "− Google Fees",  value: fmtUSD(googleFees),                     sub: "15% cut", neg: true },
              { label: "− Infra & Runs", value: fmtUSD(MONTHLY_INFRA + automationCost), sub: `$${MONTHLY_INFRA} + runs`, neg: true },
              { label: "Net Margin",     value: fmtUSD(netMargin),                      sub: "est. monthly", net: true },
            ].map(({ label, value, sub, neg, net }) => (
              <div key={label} className="px-5 py-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">{label}</p>
                <p className={`text-xl font-bold tabular-nums ${neg ? "text-destructive" : net ? (netMargin >= 0 ? "text-emerald-400" : "text-destructive") : ""}`}>{value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 pt-2 border-t border-border/40">
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={marginSteps} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.55 0.01 265)" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip contentStyle={TT} formatter={(v: number) => [fmtUSD(v), "Revenue"]} />
                  <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#mg)" dot={{ fill: "#34d399", r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* ── Automation costs ── */}
      <div>
        <SectionLabel>Automation costs</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Total Run Cost"     value={formatCost(cost?.totalCost)}          sub={`${cost?.billedRuns ?? 0} runs · ${((cost?.totalSeconds ?? 0) / 60).toFixed(0)} min`} />
          <KpiCard label="Cost / Application" value={formatCost(cost?.costPerApplication)} sub={`avg ${(cost?.averageSeconds ?? 0).toFixed(0)}s per run`} />
          <KpiCard label="Cost / Completed"   value={formatCost(cost?.costPerCompleted)}   sub={`${cost?.completedRuns ?? 0} completed`} />
          <KpiCard label="Wasted on Failures" value={formatCost(cost ? cost.totalCost - cost.completedCost : undefined)}
            sub={`${(cost?.billedRuns ?? 0) - (cost?.completedRuns ?? 0)} failed runs`} />
        </div>
      </div>

      {/* ── Pricing reference — separate INTL / IN tabs ── */}
      <div>
        <SectionLabel>Pricing reference</SectionLabel>
        <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
          <Tabs defaultValue="intl">
            <div className="px-5 pt-3 pb-0 border-b border-border/40 flex items-center justify-between">
              <p className="text-sm font-medium">Plan pricing</p>
              <TabsList className="h-7 mb-2">
                <TabsTrigger value="intl" className="text-xs px-3 h-6">INTL · USD</TabsTrigger>
                <TabsTrigger value="in"   className="text-xs px-3 h-6">IN · INR</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="intl" className="mt-0">
              <PlanTable plans={INTL} counts={intlCounts} fmt={fmtUSD} free={free} />
            </TabsContent>
            <TabsContent value="in" className="mt-0">
              <PlanTable plans={IN} counts={inCounts} fmt={fmtINR} free={free} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ── Paid subscribers table ── */}
      <div>
        <SectionLabel>Paid subscribers</SectionLabel>
        <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
          <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
            <p className="text-sm font-medium">All paid subscribers</p>
            <Badge variant="secondary" className="text-[10px]">{paid} total</Badge>
          </div>
          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border/40 text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                  <th className="text-left px-5 py-2.5">User</th>
                  <th className="text-left px-4 py-2.5 hidden md:table-cell">Email</th>
                  <th className="text-left px-4 py-2.5">Plan</th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">Region</th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">Billing</th>
                  <th className="text-left px-4 py-2.5 hidden lg:table-cell">Platform</th>
                  <th className="text-right px-4 py-2.5 hidden sm:table-cell">Price/mo</th>
                  <th className="text-right px-5 py-2.5 hidden md:table-cell">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {paidUsers.map((user) => {
                  const plan    = canon(user.subscription_type)
                  const isIN    = user.region === "IN"
                  const planInfo = isIN ? IN_MAP[plan] : INTL_MAP[plan]
                  const price   = planInfo ? (isIN ? fmtINR(planInfo.monthly) : fmtUSD(planInfo.monthly)) : "—"
                  const expired = user.subscription_end_date && new Date(user.subscription_end_date) < new Date()
                  return (
                    <tr key={user.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[10px] font-bold shrink-0">
                            {(user.full_name || user.email).charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium truncate max-w-[120px]">{user.full_name || "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                        <span className="truncate max-w-[180px] block">{user.email}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: PC[plan] ?? PC.free }} />
                          <span className="capitalize text-xs">{plan}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <Badge variant="outline" className="text-[10px]">{user.region ?? "INTL"}</Badge>
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        <Badge variant="secondary" className="text-[10px]">
                          {user.billing_period === "annual" ? "Annual" : "Monthly"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground capitalize hidden lg:table-cell">
                        {user.platform ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-xs hidden sm:table-cell">{price}</td>
                      <td className="px-5 py-2.5 text-right hidden md:table-cell">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-xs text-muted-foreground">
                            {user.subscription_end_date ? new Date(user.subscription_end_date).toLocaleDateString() : "—"}
                          </span>
                          {expired && <Badge variant="secondary" className="bg-destructive/15 text-destructive text-[9px]">Expired</Badge>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {paidUsers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">
                      No paid subscribers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  )
}

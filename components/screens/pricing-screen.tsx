"use client"

import { useState } from "react"
import useSWR from "swr"
import { formatCost } from "@/lib/run-cost"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie,
} from "recharts"

interface PaidUser {
  id: string
  email: string
  full_name: string | null
  subscription_type: string | null
  subscription_start_date: string | null
  subscription_end_date: string | null
}

interface Stats { total: number; premium: number; free: number }

interface CostStats {
  totalCost: number
  billedRuns: number
  totalSeconds: number
  costPerApplication: number
  averageSeconds: number
  completedCost: number
  completedRuns: number
  costPerCompleted: number
}

const PRICES = { monthly: 49.99 }
const USD_TO_INR = 94.87
const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function PricingScreen() {
  const [currency, setCurrency] = useState<"USD" | "INR">("USD")

  function fmt(usd: number | null | undefined): string {
    if (currency === "INR") {
      if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—"
      const inr = usd * USD_TO_INR
      if (inr === 0) return "₹0"
      if (inr < 1) return `₹${inr.toFixed(4)}`
      if (inr < 100) return `₹${inr.toFixed(2)}`
      return `₹${inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return formatCost(usd)
  }

  function fmtFixed(usd: number): string {
    if (currency === "INR") {
      const inr = usd * USD_TO_INR
      return `₹${inr.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
    return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const { data: stats, isLoading: statsLoading } = useSWR<Stats>("/api/pricing", fetcher, { revalidateOnFocus: false })
  const { data: paidUsers = [], isLoading: paidLoading } = useSWR<PaidUser[]>("/api/pricing/paid", fetcher, { revalidateOnFocus: false })
  const { data: cost } = useSWR<CostStats>("/api/pricing/cost", fetcher, { revalidateOnFocus: false })

  const total = stats?.total ?? 0
  const premium = stats?.premium ?? 0
  const free = stats?.free ?? 0
  const mrr = premium * PRICES.monthly
  const arr = mrr * 12
  const paidPct = total > 0 ? ((premium / total) * 100).toFixed(1) : "0"

  const pieData = [
    { name: "Free", value: free, color: "oklch(0.6 0.02 260)" },
    { name: "Premium", value: premium, color: "oklch(0.7 0.15 55)" },
  ]
  const revenueData = [{ name: "Premium", revenue: premium * PRICES.monthly }]
  const barColors = ["oklch(0.7 0.18 270)", "oklch(0.78 0.16 70)"]

  if (statsLoading || paidLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Loading revenue data...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gradient">Revenue</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Subscription breakdown, revenue metrics, and user insights</p>
        </div>
        <button
          onClick={() => setCurrency((c) => (c === "USD" ? "INR" : "USD"))}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent/50 transition-colors"
        >
          <span className={currency === "USD" ? "text-foreground" : "text-muted-foreground"}>USD</span>
          <span className="text-muted-foreground">/</span>
          <span className={currency === "INR" ? "text-foreground" : "text-muted-foreground"}>INR</span>
        </button>
      </div>

      {/* ── Cost of running the automation ──
          The cards below report what the product EARNS. This reports what it
          costs: Kernel bills browser time by the second, so every application
          that ran has a real price, and the two only mean anything together. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Total Run Cost</p>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{fmt(cost?.totalCost)}</span>
            <p className="text-[10px] text-muted-foreground mt-1">
              {cost ? `${cost.billedRuns} runs · ${(cost.totalSeconds / 60).toFixed(0)} min of browser time` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Cost / Application</p>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{fmt(cost?.costPerApplication)}</span>
            <p className="text-[10px] text-muted-foreground mt-1">
              {cost ? `avg ${cost.averageSeconds.toFixed(0)}s per run` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Cost / Completed</p>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{fmt(cost?.costPerCompleted)}</span>
            {/* The true unit cost: failed runs burn browser time too, so this is
                always the higher — and more honest — of the two figures. */}
            <p className="text-[10px] text-muted-foreground mt-1">
              {cost ? `${cost.completedRuns} completed · ${fmt(cost.completedCost)} of the total` : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Wasted on Failures</p>
            <span className="text-2xl font-bold tracking-tight tabular-nums">
              {fmt(cost ? cost.totalCost - cost.completedCost : undefined)}
            </span>
            <p className="text-[10px] text-muted-foreground mt-1">
              {cost ? `${cost.billedRuns - cost.completedRuns} runs that produced no application` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Total Users</p>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{total}</span>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Free</p>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{free}</span>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Premium</p>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{premium}</span>
            <p className="text-[11px] text-muted-foreground mt-1">{currency === "INR" ? `₹${(12.99 * USD_TO_INR).toFixed(0)}/wk · ₹${(49.99 * USD_TO_INR).toFixed(0)}/mo` : "$12.99/wk · $49.99/mo"}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">MRR</p>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{fmtFixed(mrr)}</span>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">ARR</p>
            <span className="text-2xl font-bold tracking-tight tabular-nums">{fmtFixed(arr)}</span>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Rate Banner */}
      <Card className="bg-accent/30 border-border">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Paid Conversion Rate</p>
            <p className="text-[11px] text-muted-foreground">{premium} of {total} users are on a paid plan</p>
          </div>
          <span className="text-2xl font-bold tabular-nums">{paidPct}%</span>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Subscription Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" stroke="none">
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.16 0.006 265)", border: "1px solid oklch(0.24 0.008 265)", borderRadius: "8px", fontSize: 12, color: "oklch(0.97 0.003 265)" }}
                    formatter={(value: number, name: string) => [`${value} users`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-xs text-muted-foreground">{entry.name}: {entry.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "oklch(0.62 0.012 265)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.62 0.012 265)" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => currency === "INR" ? `₹${(v * USD_TO_INR).toFixed(0)}` : `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.16 0.006 265)", border: "1px solid oklch(0.24 0.008 265)", borderRadius: "8px", fontSize: 12, color: "oklch(0.97 0.003 265)" }}
                    formatter={(value: number, name: string) => {
                      if (name === "revenue") return [fmtFixed(value), "Revenue"]
                      return [value, "Users"]
                    }}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                    {revenueData.map((_, i) => <Cell key={i} fill={barColors[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: barColors[0] }} />
                <span className="text-xs text-muted-foreground">Premium: {fmtFixed(premium * PRICES.monthly)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Per User Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Avg Revenue Per User</p>
            <span className="text-2xl font-bold">{fmtFixed(total > 0 ? mrr / total : 0)}</span>
            <p className="text-[11px] text-muted-foreground mt-1">across all {total} users</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Avg Revenue Per Paid User</p>
            <span className="text-2xl font-bold">{fmtFixed(premium > 0 ? mrr / premium : 0)}</span>
            <p className="text-[11px] text-muted-foreground mt-1">across {premium} paid users</p>
          </CardContent>
        </Card>
      </div>

      {/* Paid Subscribers Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Paid Subscribers</CardTitle>
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground text-[10px]">
              {premium} subscribers
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:grid grid-cols-[2fr_2fr_100px_100px_1fr_1fr] gap-4 px-4 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <span>Name</span>
            <span>Email</span>
            <span>Plan</span>
            <span className="text-right">Price</span>
            <span>Start Date</span>
            <span>End Date</span>
          </div>
          <div className="divide-y divide-border max-h-[400px] overflow-auto">
            {paidUsers.map((user) => {
              const isExpired = user.subscription_end_date && new Date(user.subscription_end_date) < new Date()
              return (
                <div key={user.id} className="grid grid-cols-1 md:grid-cols-[2fr_2fr_100px_100px_1fr_1fr] gap-2 md:gap-4 px-4 py-3 hover:bg-accent/30 transition-colors items-center">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground shrink-0">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium truncate">{user.full_name || "—"}</span>
                  </div>
                  <span className="text-sm text-muted-foreground truncate">{user.email}</span>
                  <div>
                    <Badge variant="secondary" className="bg-violet-500/15 text-violet-400 text-[10px]">Premium</Badge>
                  </div>
                  <span className="text-sm font-medium md:text-right">{fmtFixed(PRICES.monthly)}</span>
                  <span className="text-xs text-muted-foreground">
                    {user.subscription_start_date ? new Date(user.subscription_start_date).toLocaleDateString() : "—"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {user.subscription_end_date ? new Date(user.subscription_end_date).toLocaleDateString() : "—"}
                    </span>
                    {isExpired && (
                      <Badge variant="secondary" className="bg-destructive/15 text-destructive text-[9px]">Expired</Badge>
                    )}
                  </div>
                </div>
              )
            })}
            {paidUsers.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No paid subscribers yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

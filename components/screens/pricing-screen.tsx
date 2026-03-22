"use client"

import { useMemo } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Users, Crown, Gem, UserX, DollarSign, TrendingUp, ArrowUp, ArrowDown,
} from "lucide-react"
import {
  Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie,
} from "recharts"

interface Profile {
  id: string
  email: string
  full_name: string | null
  subscription_type: string | null
  subscription_start_date: string | null
  subscription_end_date: string | null
  created_at: string
}

const PRICES = { pro: 20, premium: 79.99 }

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) return []
  return res.json()
}

export function PricingScreen() {
  const { data: profiles = [], isLoading } = useSWR<Profile[]>("/api/pricing", fetcher, {
    fallbackData: [],
    revalidateOnFocus: false,
  })

  const stats = useMemo(() => {
    const free = profiles.filter((p) => !p.subscription_type || p.subscription_type === "free")
    const pro = profiles.filter((p) => p.subscription_type === "pro")
    const premium = profiles.filter((p) => p.subscription_type === "premium")
    const mrr = pro.length * PRICES.pro + premium.length * PRICES.premium
    const arr = mrr * 12
    const paidPct = profiles.length > 0 ? (((pro.length + premium.length) / profiles.length) * 100).toFixed(1) : "0"
    return { total: profiles.length, free: free.length, pro: pro.length, premium: premium.length, mrr, arr, paidPct }
  }, [profiles])

  const pieData = useMemo(() => [
    { name: "Free", value: stats.free, color: "oklch(0.6 0.02 260)" },
    { name: "Pro", value: stats.pro, color: "oklch(0.65 0.2 145)" },
    { name: "Premium", value: stats.premium, color: "oklch(0.7 0.15 55)" },
  ], [stats])

  const revenueData = useMemo(() => [
    { name: "Pro", revenue: stats.pro * PRICES.pro, users: stats.pro },
    { name: "Premium", revenue: stats.premium * PRICES.premium, users: stats.premium },
  ], [stats])

  const signupTimeline = useMemo(() => {
    const months = new Map<string, { free: number; pro: number; premium: number }>()
    profiles.forEach((p) => {
      const d = new Date(p.created_at)
      const key = `${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`
      if (!months.has(key)) months.set(key, { free: 0, pro: 0, premium: 0 })
      const entry = months.get(key)!
      const type = p.subscription_type || "free"
      if (type === "pro") entry.pro++
      else if (type === "premium") entry.premium++
      else entry.free++
    })
    return Array.from(months.entries()).map(([month, data]) => ({ month, ...data }))
  }, [profiles])

  const paidUsers = useMemo(() =>
    profiles.filter((p) => p.subscription_type === "pro" || p.subscription_type === "premium"),
  [profiles])

  const barColors = ["oklch(0.65 0.2 145)", "oklch(0.7 0.15 55)"]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Loading pricing data...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Subscription breakdown, revenue metrics, and user insights</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Total Users</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{stats.total}</span>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserX className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Free</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{stats.free}</span>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Pro ($20/mo)</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{stats.pro}</span>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Gem className="h-4 w-4 text-violet-500" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Premium ($79.99/mo)</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">{stats.premium}</span>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">MRR</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">${stats.mrr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">ARR</span>
            </div>
            <span className="text-3xl font-bold tracking-tight">${stats.arr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </CardContent>
        </Card>
      </div>

      {/* Conversion Rate Banner */}
      <Card className="bg-accent/30 border-border">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Paid Conversion Rate</p>
              <p className="text-[11px] text-muted-foreground">{stats.pro + stats.premium} of {stats.total} users are on a paid plan</p>
            </div>
          </div>
          <span className="text-2xl font-bold">{stats.paidPct}%</span>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Subscription Distribution Donut */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Subscription Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.17 0.005 260)", border: "1px solid oklch(0.25 0.005 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }}
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

        {/* Revenue by Plan */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "oklch(0.6 0 0)" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "oklch(0.17 0.005 260)", border: "1px solid oklch(0.25 0.005 260)", borderRadius: "8px", fontSize: 12, color: "oklch(0.95 0 0)" }}
                    formatter={(value: number, name: string) => {
                      if (name === "revenue") return [`$${value.toFixed(2)}`, "Revenue"]
                      return [value, "Users"]
                    }}
                  />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                    {revenueData.map((_, i) => (
                      <Cell key={i} fill={barColors[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-2">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: barColors[0] }} />
                <span className="text-xs text-muted-foreground">Pro: ${(stats.pro * PRICES.pro).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: barColors[1] }} />
                <span className="text-xs text-muted-foreground">Premium: ${(stats.premium * PRICES.premium).toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Per User Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Avg Revenue Per User</p>
            <span className="text-2xl font-bold">${stats.total > 0 ? (stats.mrr / stats.total).toFixed(2) : "0.00"}</span>
            <p className="text-[11px] text-muted-foreground mt-1">across all {stats.total} users</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Avg Revenue Per Paid User</p>
            <span className="text-2xl font-bold">${(stats.pro + stats.premium) > 0 ? (stats.mrr / (stats.pro + stats.premium)).toFixed(2) : "0.00"}</span>
            <p className="text-[11px] text-muted-foreground mt-1">across {stats.pro + stats.premium} paid users</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Premium to Pro Ratio</p>
            <span className="text-2xl font-bold">{stats.pro > 0 ? (stats.premium / stats.pro).toFixed(2) : stats.premium > 0 ? "∞" : "0"}</span>
            <p className="text-[11px] text-muted-foreground mt-1">{stats.premium} premium vs {stats.pro} pro</p>
          </CardContent>
        </Card>
      </div>

      {/* Paid Subscribers Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Paid Subscribers</CardTitle>
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground text-[10px]">
              {paidUsers.length} subscribers
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[2fr_2fr_100px_100px_1fr_1fr] gap-4 px-4 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <span>Name</span>
            <span>Email</span>
            <span>Plan</span>
            <span className="text-right">Price</span>
            <span>Start Date</span>
            <span>End Date</span>
          </div>
          <div className="divide-y divide-border max-h-[400px] overflow-auto">
            {paidUsers.map((user) => {
              const price = user.subscription_type === "premium" ? PRICES.premium : PRICES.pro
              const isExpired = user.subscription_end_date && new Date(user.subscription_end_date) < new Date()
              return (
                <div key={user.id} className="grid grid-cols-[2fr_2fr_100px_100px_1fr_1fr] gap-4 px-4 py-3 hover:bg-accent/30 transition-colors items-center">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground shrink-0">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium truncate">{user.full_name || "—"}</span>
                  </div>
                  <span className="text-sm text-muted-foreground truncate">{user.email}</span>
                  <div>
                    <Badge
                      variant="secondary"
                      className={
                        user.subscription_type === "premium"
                          ? "bg-violet-500/15 text-violet-400 text-[10px]"
                          : "bg-amber-500/15 text-amber-400 text-[10px]"
                      }
                    >
                      {user.subscription_type === "premium" ? "Premium" : "Pro"}
                    </Badge>
                  </div>
                  <span className="text-sm font-medium text-right">${price.toFixed(2)}</span>
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

      {/* All Users Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">All Users</CardTitle>
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground text-[10px]">
              {profiles.length} users
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-[2fr_2fr_100px_1fr] gap-4 px-4 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <span>Name</span>
            <span>Email</span>
            <span>Plan</span>
            <span>Joined</span>
          </div>
          <div className="divide-y divide-border max-h-[400px] overflow-auto">
            {profiles.map((user) => {
              const type = user.subscription_type || "free"
              return (
                <div key={user.id} className="grid grid-cols-[2fr_2fr_100px_1fr] gap-4 px-4 py-3 hover:bg-accent/30 transition-colors items-center">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground shrink-0">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium truncate">{user.full_name || "—"}</span>
                  </div>
                  <span className="text-sm text-muted-foreground truncate">{user.email}</span>
                  <div>
                    <Badge
                      variant="secondary"
                      className={
                        type === "premium"
                          ? "bg-violet-500/15 text-violet-400 text-[10px]"
                          : type === "pro"
                          ? "bg-amber-500/15 text-amber-400 text-[10px]"
                          : "bg-secondary text-secondary-foreground text-[10px]"
                      }
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString()}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useState, useMemo, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { RefreshCw, ChevronLeft, ChevronRight, Star, Smartphone, Package, Globe } from "lucide-react"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts"

const TT = {
  backgroundColor: "oklch(0.13 0.006 265)",
  border: "1px solid oklch(0.22 0.008 265)",
  borderRadius: "6px",
  fontSize: 11,
  color: "oklch(0.92 0.003 265)",
  padding: "6px 10px",
}

const COLORS = [
  "oklch(0.7 0.18 270)",
  "oklch(0.7 0.16 220)",
  "oklch(0.72 0.18 155)",
  "oklch(0.78 0.16 70)",
  "oklch(0.65 0.22 0)",
  "oklch(0.72 0.18 320)",
]

const STAR_COLOR = "oklch(0.78 0.16 70)"

interface AApp { id: string; jobId: string; company_name: string; status: string; createdAt: string }

const PER = 10

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 mb-3">{children}</p>
}

function Pg({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null
  return (
    <div className="flex items-center gap-1.5 px-5 py-2.5 border-t border-border/40">
      <span className="text-[10px] text-muted-foreground flex-1">Page {page} of {total}</span>
      <button disabled={page === 1} onClick={() => onChange(page - 1)}
        className="flex h-6 w-6 items-center justify-center rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
        <ChevronLeft className="h-3 w-3" />
      </button>
      <button disabled={page === total} onClick={() => onChange(page + 1)}
        className="flex h-6 w-6 items-center justify-center rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-border disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  )
}

function StarRow({ star, count, max }: { star: number; count: number; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-3 shrink-0">{star}</span>
      <Star className="h-3 w-3 text-yellow-400 fill-yellow-400 shrink-0" />
      <div className="flex-1 h-2 rounded-full bg-accent/40 overflow-hidden">
        <div className="h-full rounded-full bg-yellow-400/70 transition-all duration-500"
          style={{ width: max > 0 ? `${(count / max) * 100}%` : "0%" }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-4 text-right shrink-0">{count}</span>
    </div>
  )
}

export function AnalyticsScreen() {
  const [jobCount, setJobCount]     = useState(0)
  const [apps, setApps]             = useState<AApp[]>([])
  const [ios, setIos]               = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [iosLoading, setIosLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter]         = useState("all")
  const [swipesPage, setSwipesPage] = useState(1)

  const loadPlatform = async () => {
    const res = await fetch("/api/analytics")
    const d   = await res.json()
    if (d.jobCount !== undefined) setJobCount(d.jobCount)
    if (d.applications) setApps(d.applications.map((a: any) => ({
      id: a.id, jobId: a.job_id, company_name: a.company_name,
      status: a.status, createdAt: a.created_at,
    })))
  }

  const loadIos = async () => {
    setIosLoading(true)
    const res = await fetch("/api/appstore")
    const d   = await res.json()
    if (!d.error) setIos(d)
    setIosLoading(false)
  }

  useEffect(() => {
    Promise.all([loadPlatform(), loadIos()]).finally(() => setLoading(false))
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([loadPlatform(), loadIos()])
    setRefreshing(false)
  }

  const companyNames = useMemo(() => [...new Set(apps.map(a => a.company_name).filter(Boolean))].sort(), [apps])
  const fApps = useMemo(() => filter === "all" ? apps : apps.filter(a => a.company_name === filter), [filter, apps])

  const breakdown = useMemo(() => {
    const m = new Map<string, { name: string; apps: number }>()
    for (const a of apps) {
      if (!a.company_name) continue
      const c = m.get(a.company_name) || { name: a.company_name, apps: 0 }
      c.apps++; m.set(a.company_name, c)
    }
    return [...m.values()].sort((a, b) => b.apps - a.apps)
  }, [apps])

  const totalSwipesPages = Math.ceil(breakdown.length / PER)
  const pageSwipes = breakdown.slice((swipesPage - 1) * PER, swipesPage * PER)

  const peakHours = useMemo(() => {
    const labels = ["6am","7am","8am","9am","10am","11am","12pm","1pm","2pm","3pm","4pm","5pm"]
    const c = new Array(12).fill(0)
    fApps.forEach(a => { if (a.createdAt) { const h = new Date(a.createdAt).getHours(); if (h >= 6 && h <= 17) c[h - 6]++ } })
    return labels.map((hour, i) => ({ hour, count: c[i] }))
  }, [fApps])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )

  return (
    <Tabs defaultValue="platform" className="w-full">
      <div className="flex items-center justify-between mb-6">
        <TabsList className="bg-transparent border-0 p-0 h-auto gap-0 border-b border-border w-full rounded-none justify-start">
          <TabsTrigger value="platform" className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground text-muted-foreground px-4 pb-3 pt-0 h-auto text-sm font-medium transition-colors">
            Platform
          </TabsTrigger>
          <TabsTrigger value="ios" className="rounded-none border-0 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground text-muted-foreground px-4 pb-3 pt-0 h-auto text-sm font-medium transition-colors flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5" /> iOS App
          </TabsTrigger>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 ml-auto border-border/60 mb-3" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </TabsList>
      </div>

      {/* ── Platform tab ── */}
      <TabsContent value="platform" className="mt-0 flex flex-col gap-8">

        {/* Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={(v) => { setFilter(v); setSwipesPage(1) }}>
            <SelectTrigger className="h-8 text-xs w-48 bg-card border-border/60">
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companyNames.map(n => (
                <SelectItem key={n} value={n}>
                  <span className="flex items-center gap-2">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-accent text-[8px] font-bold shrink-0">{n.charAt(0)}</span>
                    {n}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filter !== "all" && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground px-2" onClick={() => setFilter("all")}>
              Clear
            </Button>
          )}
        </div>

        {/* KPIs */}
        <div>
          <SectionLabel>Summary</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Jobs listed",  value: jobCount     },
              { label: "Applications", value: fApps.length },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4 shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)]">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">{s.label}</p>
                <p className="text-[28px] font-bold tracking-tight leading-none">{s.value.toLocaleString()}</p>
                {filter !== "all" && <p className="text-[10px] text-muted-foreground mt-1.5 truncate">{filter}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Peak hours chart */}
        <div>
          <SectionLabel>Trends</SectionLabel>
          <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
            <div className="px-5 pt-4 pb-0">
              <p className="text-sm font-medium">Peak application hours</p>
            </div>
            <div className="h-48 px-2 pb-3 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={peakHours} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={TT} cursor={{ fill: "oklch(1 0 0 / 0.03)" }} />
                  <Bar dataKey="count" fill="oklch(0.65 0.15 250)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Company breakdown */}
        {filter === "all" && breakdown.length > 0 && (
          <div>
            <SectionLabel>By company</SectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-border/40">
                  <p className="text-sm font-medium">Applications by company</p>
                </div>
                <div className="px-5 py-4 flex flex-col gap-2.5">
                  {pageSwipes.map((e, i) => {
                    const max = breakdown[0]?.apps || 1
                    const gi  = (swipesPage - 1) * PER + i
                    return (
                      <div key={e.name} className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground/40 font-mono w-4 shrink-0 text-right">{gi + 1}</span>
                        <span className="text-xs font-medium w-24 shrink-0 truncate">{e.name}</span>
                        <div className="flex-1 h-3 rounded-full bg-accent/30 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${(e.apps / max) * 100}%`, backgroundColor: COLORS[gi % COLORS.length] }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums w-8 text-right shrink-0">{e.apps}</span>
                      </div>
                    )
                  })}
                </div>
                <Pg page={swipesPage} total={totalSwipesPages} onChange={setSwipesPage} />
              </div>

              <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-border/40">
                  <p className="text-sm font-medium">Top 5 distribution</p>
                </div>
                <div className="h-52 px-3 pb-4 pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdown.slice(0, 5)} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip contentStyle={TT} formatter={(v: number) => [v.toLocaleString(), "Apps"]} cursor={{ fill: "oklch(1 0 0 / 0.03)" }} />
                      <Bar dataKey="apps" radius={[0, 3, 3, 0]}>
                        {breakdown.slice(0, 5).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </TabsContent>

      {/* ── iOS App tab ── */}
      <TabsContent value="ios" className="mt-0">
        {iosLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : !ios ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">Failed to load App Store data</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">

            {/* App header */}
            <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 shrink-0">
                  <Smartphone className="h-7 w-7 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold">{ios.appName}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{ios.bundleId}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">App ID: {ios.appId}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs bg-accent px-2.5 py-1 rounded-full text-muted-foreground font-medium">v{ios.currentVersion}</span>
                  <p className="text-[10px] text-muted-foreground mt-1">{ios.totalVersions} releases</p>
                </div>
              </div>
            </div>

            {/* KPI strip */}
            <div>
              <SectionLabel>Overview</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Avg Rating",     value: ios.avgRating ? `${ios.avgRating} ★` : "—",          sub: "out of 5" },
                  { label: "Total Ratings",  value: ios.totalRatings?.toLocaleString() ?? "—",            sub: "all time" },
                  { label: "Total Releases", value: ios.totalVersions,                                    sub: "versions shipped" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4 shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)]">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">{s.label}</p>
                    <p className="text-[28px] font-bold tracking-tight leading-none">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Ratings breakdown + territory */}
            <div>
              <SectionLabel>Ratings</SectionLabel>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Star breakdown */}
                <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                  <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center justify-between">
                    <p className="text-sm font-medium">Rating breakdown</p>
                    <div className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                      <span className="text-sm font-bold">{ios.avgRating ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">/ 5</span>
                    </div>
                  </div>
                  <div className="px-5 py-4 flex flex-col gap-3">
                    {(ios.ratingBreakdown ?? []).map((r: any) => (
                      <StarRow key={r.star} star={r.star} count={r.count} max={ios.totalRatings || 1} />
                    ))}
                  </div>
                </div>

                {/* Territory breakdown */}
                <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                  <div className="px-5 pt-4 pb-3 border-b border-border/40 flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-sm font-medium">Reviews by territory</p>
                  </div>
                  {ios.byTerritory?.length > 0 ? (
                    <div className="px-5 py-4 flex flex-col gap-2.5">
                      {ios.byTerritory.map((t: any, i: number) => (
                        <div key={t.territory} className="flex items-center gap-3">
                          <span className="text-[10px] text-muted-foreground/40 font-mono w-4 shrink-0 text-right">{i + 1}</span>
                          <span className="text-xs font-medium w-12 shrink-0">{t.territory}</span>
                          <div className="flex-1 h-2 rounded-full bg-accent/30 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${(t.count / (ios.byTerritory[0]?.count || 1)) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                          </div>
                          <span className="text-xs font-semibold tabular-nums w-4 text-right shrink-0">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground px-5 py-8 text-center">No territory data</p>
                  )}
                </div>
              </div>
            </div>

            {/* Version history */}
            <div>
              <SectionLabel>Version History</SectionLabel>
              <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                <div className="hidden sm:grid grid-cols-[80px_1fr_120px] px-5 py-2.5 border-b border-border/40 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                  <span>Version</span>
                  <span>Release Type</span>
                  <span className="text-right">Date</span>
                </div>
                <div className="divide-y divide-border/30 max-h-64 overflow-auto">
                  {(ios.versions ?? []).map((v: any, i: number) => (
                    <div key={i} className="grid grid-cols-[80px_1fr_120px] items-center px-5 py-2.5 hover:bg-accent/20 transition-colors">
                      <div className="flex items-center gap-2">
                        {i === 0 && <span className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />}
                        <span className="text-xs font-semibold font-mono">{v.version}</span>
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">{v.releaseType?.toLowerCase().replace('_', ' ')}</span>
                      <span className="text-xs text-muted-foreground text-right">
                        {v.date ? new Date(v.date).toLocaleDateString() : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reviews */}
            <div>
              <SectionLabel>Customer Reviews</SectionLabel>
              <div className="rounded-xl border border-border/60 bg-card shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)] overflow-hidden">
                {ios.reviews?.length > 0 ? (
                  <div className="divide-y divide-border/30">
                    {ios.reviews.map((r: any, i: number) => (
                      <div key={i} className="px-5 py-4 hover:bg-accent/20 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-1.5">
                            {Array.from({ length: 5 }).map((_, s) => (
                              <Star key={s} className={`h-3 w-3 ${s < r.rating ? "text-yellow-400 fill-yellow-400" : "text-muted-foreground/30"}`} />
                            ))}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {r.territory && <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded text-muted-foreground">{r.territory}</span>}
                            <span className="text-[10px] text-muted-foreground">
                              {r.date ? new Date(r.date).toLocaleDateString() : ""}
                            </span>
                          </div>
                        </div>
                        {r.title && <p className="text-xs font-semibold mb-1">{r.title}</p>}
                        {r.body && <p className="text-xs text-muted-foreground leading-relaxed">{r.body}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground px-5 py-8 text-center">No reviews yet</p>
                )}
              </div>
            </div>

          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

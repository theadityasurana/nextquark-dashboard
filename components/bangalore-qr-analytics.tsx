"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"
import { Check, Copy, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DownloadAnalyticsPayload } from "@/lib/download-analytics-types"
import { formatIst } from "@/lib/ist"

const BangaloreQrMap = dynamic(
  () => import("@/components/bangalore-qr-map").then((m) => m.BangaloreQrMap),
  {
    ssr: false,
    loading: () => <div className="h-[420px] w-full rounded-lg bg-muted/20 animate-pulse" />,
  },
)

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
]

const EXAMPLE_SLUGS = [
  "mg-road-metro-exit-2",
  "hsr-sector-7-cafe",
  "bellandur-ecoworld-gate",
  "koramangala-5th-block-metro",
  "indiranagar-100ft-road",
  "iisc-main-gate",
]

const QR_BASE = "https://download.nextquark.in/"

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

function hourLabel(h: number) {
  if (h === 0) return "12am"
  if (h < 12) return `${h}am`
  if (h === 12) return "12pm"
  return `${h - 12}pm`
}

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  )
}

export function BangaloreQrAnalytics({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<DownloadAnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapMode, setMapMode] = useState<"pins" | "clusters">("pins")
  const [slug, setSlug] = useState("mg-road-metro-exit-2")

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch("/api/download-analytics")
      .then((r) => r.json())
      .then((json: DownloadAnalyticsPayload) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) {
          setData({
            kpis: { today: 0, d7: 0, d30: 0 },
            pins: [],
            clusters: [],
            posters: [],
            byHour: [],
            daily: [],
            devices: [],
            error: "Failed to load download analytics",
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const builtUrl = useMemo(() => {
    const c = slugify(slug)
    return c ? `${QR_BASE}?c=${c}` : QR_BASE
  }, [slug])

  const hourData = useMemo(
    () => (data?.byHour ?? []).map((d) => ({ ...d, label: hourLabel(d.hour) })),
    [data],
  )

  const dailyData = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        ...d,
        label: new Date(`${d.day}T00:00:00+05:30`).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        }),
      })),
    [data],
  )

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const kpis = data?.kpis ?? { today: 0, d7: 0, d30: 0 }
  const devices = data?.devices ?? []
  const deviceTotal = devices.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold tracking-tight">Bangalore QR</h2>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Field ops for download.nextquark.in — campaign slug is ground truth for which poster was scanned; map pins are Cloudflare IP estimates (~100m–1km).
          </p>
        </div>
        <div className="flex rounded-md border border-border/60 overflow-hidden shrink-0">
          <Button
            size="sm"
            variant={mapMode === "pins" ? "secondary" : "ghost"}
            className="h-7 text-xs rounded-none"
            onClick={() => setMapMode("pins")}
          >
            Pins
          </Button>
          <Button
            size="sm"
            variant={mapMode === "clusters" ? "secondary" : "ghost"}
            className="h-7 text-xs rounded-none"
            onClick={() => setMapMode("clusters")}
          >
            Heat (~150m)
          </Button>
        </div>
      </div>

      {data?.error && (
        <p className="text-xs text-destructive/80 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          {data.error}. Confirm <code className="font-mono">download_link_visits</code> exists and the service role can read it.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Scans today" value={kpis.today.toLocaleString()} sub="IST calendar day" />
        <StatCard label="Last 7 days" value={kpis.d7.toLocaleString()} sub="rolling" />
        <StatCard label="Last 30 days" value={kpis.d30.toLocaleString()} sub="rolling" />
        <StatCard
          label="Map pins"
          value={(data?.pins.length ?? 0).toLocaleString()}
          sub="Bangalore bbox only"
        />
      </div>

      <ChartCard
        title="Scan map"
        sub="Centered on Bangalore (12.97, 77.59). Pins = phone location estimate; campaign in tooltip = which QR."
      >
        <BangaloreQrMap pins={data?.pins ?? []} clusters={data?.clusters ?? []} mode={mapMode} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Scans by hour (IST)" sub="when to restock posters">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={TT_STYLE}>
                        <p className="font-semibold mb-1">{d.label} IST</p>
                        <p className="text-sm">{d.scans.toLocaleString()} scans</p>
                      </div>
                    )
                  }}
                  cursor={{ fill: "oklch(1 0 0 / 0.04)" }}
                />
                <Bar dataKey="scans" fill="oklch(0.65 0.15 250)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Daily scans" sub="last 14 days, IST">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 265)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.5 0.01 265)" }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={TT_STYLE}>
                        <p className="text-xs text-muted-foreground mb-1">{d.label}</p>
                        <p className="font-semibold text-sm">{d.scans.toLocaleString()} scans</p>
                      </div>
                    )
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="scans"
                  stroke={COLORS[0]}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: COLORS[0], strokeWidth: 2, stroke: "oklch(0.13 0.006 265)" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ChartCard
            title="Best-performing posters"
            sub="Rank by campaign slug, not city — city is almost always Bangalore"
          >
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    <th className="py-2 pr-3 font-medium">Poster / spot</th>
                    <th className="py-2 pr-3 font-medium text-right">Scans</th>
                    <th className="py-2 pr-3 font-medium">First seen</th>
                    <th className="py-2 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.posters ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                        No scans in the last 30 days. Print unique <span className="font-mono">?c=</span> slugs on each QR.
                      </td>
                    </tr>
                  ) : (
                    data!.posters.map((row) => (
                      <tr key={row.spot} className="border-b border-border/30 last:border-0">
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono text-xs truncate">{row.spot}</span>
                            {row.spot !== "(untagged QR)" && (
                              <CopyBtn value={`${QR_BASE}?c=${row.spot}`} />
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums font-semibold">{row.scans.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-[11px] text-muted-foreground whitespace-nowrap">{formatIst(row.first_seen)}</td>
                        <td className="py-2 text-[11px] text-muted-foreground whitespace-nowrap">{formatIst(row.last_seen)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>

        <ChartCard title="Device type" sub="mobile vs desktop">
          <div className="h-56 flex items-center gap-2">
            {devices.length === 0 ? (
              <p className="text-xs text-muted-foreground w-full text-center">No device data yet</p>
            ) : (
              <>
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie data={devices} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3}>
                      {devices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]
                        const val = d.value as number
                        const pct = deviceTotal > 0 ? ((val / deviceTotal) * 100).toFixed(1) : "0.0"
                        return (
                          <div style={TT_STYLE}>
                            <p className="font-semibold mb-1">{d.name}</p>
                            <p className="text-sm">{val.toLocaleString()} scans</p>
                            <p className="text-xs text-muted-foreground">{pct}%</p>
                          </div>
                        )
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  {devices.map((d, i) => {
                    const pct = deviceTotal > 0 ? ((d.value / deviceTotal) * 100).toFixed(1) : "0"
                    return (
                      <div key={d.name} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-xs text-muted-foreground truncate">{d.name}</span>
                        </div>
                        <span className="text-xs tabular-nums">{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </ChartCard>
      </div>

      <ChartCard title="QR URL builder" sub="Every poster needs a unique ?c= slug. Map shows where the phone was; campaign shows which poster.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="koramangala-5th-block-metro"
              className="font-mono text-xs"
            />
            <div className="flex items-center gap-2 min-w-0">
              <code className="text-[11px] truncate text-muted-foreground">{builtUrl}</code>
              <CopyBtn value={builtUrl} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_SLUGS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlug(s)}
                className="text-[11px] font-mono px-2 py-1 rounded-md border border-border/60 hover:bg-accent/40"
              >
                ?c={s}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Ingest is automatic via POST /api/track on page load. This admin view is read-only. Location is IP-based and approximate — disclose in the privacy policy.
          </p>
        </div>
      </ChartCard>
    </div>
  )
}

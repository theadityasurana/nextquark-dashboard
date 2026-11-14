"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useApi } from "@/lib/api-cache"
import dynamic from "next/dynamic"
import {
  BarChart, Bar, AreaChart, Area, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"
import { MiniStat, Segmented, chartTooltip } from "@/components/ui/dashboard"
import { Check, Copy, MapPin, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DownloadAnalyticsPayload } from "@/lib/download-analytics-types"
import type { QrMapMode } from "@/components/bangalore-qr-map"
import { formatIst } from "@/lib/ist"
import { countryLabel, locColumnLabel, placeLine } from "@/lib/geo-display"

const BangaloreQrMap = dynamic(
  () => import("@/components/bangalore-qr-map").then((m) => m.BangaloreQrMap),
  {
    ssr: false,
    loading: () => <div className="h-[420px] w-full rounded-lg bg-muted/20 animate-pulse" />,
  },
)

const TT_STYLE = chartTooltip

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const QR_URL = "https://download.nextquark.in/"

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 panel overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      <div className="px-4 pb-4 pt-4">{children}</div>
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
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground shrink-0"
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

const EMPTY: DownloadAnalyticsPayload = {
  kpis: { today: 0, d7: 0, d30: 0, total: 0, gps_pins: 0, ip_pins: 0, gps_geocode: 0, gps_only: 0, ip_place: 0 },
  pins: [],
  recentVisits: [],
  byCountry: [],
  clusters: [],
  posters: [],
  posterMarkers: [],
  spots: [],
  byHour: [],
  daily: [],
  devices: [],
  error: "Failed to load download analytics",
  spotsError: null,
}

export function BangaloreQrAnalytics({ refreshKey, range }: { refreshKey: number; range: "30d" | "all" }) {
  const { data: loaded, error: loadError, isLoading: loading, isUpdating, refresh: reload } = useApi<DownloadAnalyticsPayload>(`/api/download-analytics?range=${range}`)
  const [stableData, setStableData] = useState<DownloadAnalyticsPayload | null>(null)
  useEffect(() => { if (loaded) setStableData(loaded) }, [loaded])
  const data: DownloadAnalyticsPayload | null = loaded ?? stableData ?? (loadError ? { ...EMPTY, error: `Failed to load download analytics (${loadError.message})` } : null)
  const rangeLabel = range === "all" ? "all time" : "last 30 days"
  const [mapMode, setMapMode] = useState<QrMapMode>("clusters")
  const [picking, setPicking] = useState(false)
  const [spotForm, setSpotForm] = useState({ campaign: "", label: "", latitude: "", longitude: "", notes: "" })
  const [spotSaving, setSpotSaving] = useState(false)
  const [spotMsg, setSpotMsg] = useState<string | null>(null)

  // Reload when range changes or parent hits Refresh.
  const lastRefreshKey = useRef(refreshKey)
  const lastRange = useRef(range)
  useEffect(() => {
    const rangeChanged = range !== lastRange.current
    const refreshed = refreshKey !== lastRefreshKey.current
    lastRefreshKey.current = refreshKey
    lastRange.current = range
    if (rangeChanged || refreshed) void reload()
  }, [refreshKey, range, reload])

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

  const startPlace = (campaign: string) => {
    const existing = data?.spots.find((s) => s.campaign === campaign)
    setSpotForm({
      campaign,
      label: existing?.label || campaign,
      latitude: existing ? String(existing.latitude) : "",
      longitude: existing ? String(existing.longitude) : "",
      notes: existing?.notes || "",
    })
    setMapMode("posters")
    setPicking(true)
    setSpotMsg("Click the map at the physical poster.")
  }

  const saveSpot = async () => {
    const campaign = slugify(spotForm.campaign)
    const latitude = Number(spotForm.latitude)
    const longitude = Number(spotForm.longitude)
    if (!campaign || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setSpotMsg("Need a campaign slug and lat/lng.")
      return
    }
    setSpotSaving(true)
    setSpotMsg(null)
    const res = await fetch("/api/campaign-spots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign,
        label: spotForm.label || campaign,
        latitude,
        longitude,
        notes: spotForm.notes || null,
        active: true,
      }),
    })
    const json = await res.json()
    setSpotSaving(false)
    if (!res.ok) {
      setSpotMsg(json.error || "Save failed")
      return
    }
    setPicking(false)
    setSpotMsg("Saved poster location.")
    reload()
  }

  const deleteSpot = async (campaign: string) => {
    if (!confirm(`Remove configured location for ${campaign}? Scans stay; the map marker is removed.`)) return
    const res = await fetch(`/api/campaign-spots?campaign=${encodeURIComponent(campaign)}`, { method: "DELETE" })
    if (!res.ok) {
      const json = await res.json()
      setSpotMsg(json.error || "Delete failed")
      return
    }
    reload()
  }

  if (loading && !data && !isUpdating) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const kpis = data?.kpis ?? { today: 0, d7: 0, d30: 0, total: 0, gps_pins: 0, ip_pins: 0, gps_geocode: 0, gps_only: 0, ip_place: 0 }
  const geocodePct = kpis.total > 0 ? Math.round((kpis.gps_geocode / kpis.total) * 100) : 0
  const ipPlacePct = kpis.total > 0 ? Math.round((kpis.ip_place / kpis.total) * 100) : 0
  const devices = data?.devices ?? []
  const deviceTotal = devices.reduce((s, d) => s + d.value, 0)
  const tagged = (data?.posters ?? []).filter((p) => p.spot !== "(untagged QR)")
  const showAdvanced = tagged.length > 0 || (data?.spots.length ?? 0) > 0

  const countries = data?.byCountry ?? []
  const countryMax = Math.max(1, ...countries.map((c) => c.scans))
  const peakHour = Math.max(0, ...hourData.map((h: any) => h.scans))

  return (
    <div className="flex flex-col gap-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60">
            <QrCode className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">QR destination {isUpdating && <span>· updating…</span>}</p>
            <code className="block truncate font-mono text-[13px]">{QR_URL}</code>
          </div>
        </div>
        <CopyBtn value={QR_URL} />
      </div>

      {data?.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive/80">
          {data.error}. Confirm <code className="font-mono">download_link_visits</code> exists and the service role can read it.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <MiniStat label="Visits today" value={kpis.today} hint="IST calendar day" />
        <MiniStat label="Last 7 days" value={kpis.d7} hint="rolling" />
        <MiniStat label={range === "all" ? "All time" : "Last 30 days"} value={range === "all" ? kpis.total : kpis.d30}
          hint={range === "all" ? `${kpis.d30.toLocaleString()} in the last 30 days` : "rolling"} />
        <MiniStat label="Precise location" value={kpis.total ? `${geocodePct}%` : "—"} hint={`GPS + address · ${ipPlacePct}% IP only`} />
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Global visit map</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />GPS</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-1" />IP (approximate)</span>
              <span>Precise places need users to allow location</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {picking && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPicking(false)}>Cancel pick</Button>
            )}
            <Segmented
              value={mapMode}
              onChange={(v) => setMapMode(v as typeof mapMode)}
              options={[{ value: "clusters", label: "Heat" }, { value: "pins", label: "Pins" }, ...(showAdvanced ? [{ value: "posters", label: "Posters" }] : [])]}
            />
          </div>
        </div>
        <div className="p-3">
          <BangaloreQrMap
            pins={data?.pins ?? []}
            clusters={data?.clusters ?? []}
            posterMarkers={data?.posterMarkers ?? []}
            mode={mapMode}
            picking={picking}
            onPick={(lat, lng) => {
              if (!picking) return
              setSpotForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }))
              setSpotMsg("Coordinates filled — save to store this poster’s location.")
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-5 py-3.5">
            <h3 className="text-sm font-semibold tracking-tight">Top countries</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Network geo · {rangeLabel}</p>
          </div>
          <div className="max-h-72 overflow-y-auto px-5 py-3">
            {countries.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No visits yet</p>
            ) : countries.map((row) => (
              <div key={row.country} className="flex flex-col gap-1.5 py-2">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="truncate">
                    {countryLabel(row.country === "—" ? null : row.country)}
                    {row.country !== "—" && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{row.country}</span>}
                  </span>
                  <span className="num font-medium">{row.scans.toLocaleString()}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-chart-1" style={{ width: `${(row.scans / countryMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel overflow-hidden lg:col-span-2">
          <div className="border-b border-border px-5 py-3.5">
            <h3 className="text-sm font-semibold tracking-tight">Recent visits</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Location source: GPS + address (accurate) · GPS · IP (network)</p>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="eyebrow px-5 py-2.5">When (IST)</th>
                  <th className="eyebrow px-3 py-2.5">Place</th>
                  <th className="eyebrow px-3 py-2.5">Source</th>
                  <th className="eyebrow px-5 py-2.5">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.recentVisits ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="py-8 text-center text-xs text-muted-foreground">No visits yet</td></tr>
                ) : data!.recentVisits.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap px-5 py-2.5 text-xs tabular-nums text-muted-foreground">{formatIst(row.created_at)}</td>
                    <td className="min-w-[12rem] px-3 py-2.5 text-[13px]">{placeLine(row) || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10.5px]">{locColumnLabel(row.place_source, row.location_source)}</span>
                    </td>
                    <td className="px-5 py-2.5 text-xs capitalize text-muted-foreground">{row.device_type || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard title="Visits by hour" sub="IST · busiest hour highlighted">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={5} tickMargin={6} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={TT_STYLE}>
                        <p className="text-xs text-muted-foreground">{d.label} IST</p>
                        <p className="mt-0.5 text-sm font-semibold">{d.scans.toLocaleString()} visits</p>
                      </div>
                    )
                  }}
                  cursor={{ fill: "color-mix(in oklch, var(--foreground) 5%, transparent)" }}
                />
                <Bar dataKey="scans" radius={[3, 3, 0, 0]}>
                  {hourData.map((h: any, i: number) => <Cell key={i} fill={h.scans === peakHour ? "var(--chart-1)" : "color-mix(in oklch, var(--chart-1) 35%, transparent)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Daily visits" sub={range === "all" ? "All time, IST" : "Last 14 days, IST"}>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="qrDaily" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} minTickGap={20} tickMargin={6} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={TT_STYLE}>
                        <p className="text-xs text-muted-foreground">{d.label}</p>
                        <p className="mt-0.5 text-sm font-semibold">{d.scans.toLocaleString()} visits</p>
                      </div>
                    )
                  }}
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                />
                <Area type="monotone" dataKey="scans" stroke="var(--chart-1)" strokeWidth={2} fill="url(#qrDaily)" dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Device type" sub="Mobile vs desktop">
          {devices.length === 0 ? (
            <p className="py-16 text-center text-xs text-muted-foreground">No device data yet</p>
          ) : (
            <div className="flex h-48 flex-col justify-center gap-4">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                {devices.map((d, i) => (
                  <div key={d.name} style={{ width: `${deviceTotal > 0 ? (d.value / deviceTotal) * 100 : 0}%`, background: COLORS[i % COLORS.length] }} />
                ))}
              </div>
              <div className="flex flex-col gap-2.5">
                {devices.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-2 capitalize text-muted-foreground"><span className="h-2 w-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />{d.name}</span>
                    <span className="num font-medium">{deviceTotal > 0 ? ((d.value / deviceTotal) * 100).toFixed(1) : "0"}% <span className="font-normal text-muted-foreground">· {d.value.toLocaleString()}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {showAdvanced && (
        <details className="panel overflow-hidden">
          <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold tracking-tight">
            Advanced: tagged campaigns (?c=)
          </summary>
          <div className="px-5 pb-4 flex flex-col gap-4 border-t border-border pt-3">
            <p className="text-[11px] text-muted-foreground">
              Only if you print different <code className="font-mono">?c=</code> slugs per poster. Single-QR ops can ignore this.
            </p>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="py-2 pr-3 font-medium">Poster / spot</th>
                    <th className="py-2 pr-3 font-medium text-right">Scans</th>
                    <th className="py-2 pr-3 font-medium">Last seen</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {tagged.map((row) => (
                    <tr key={row.spot} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{row.spot}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.scans.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-[11px] text-muted-foreground">{formatIst(row.last_seen)}</td>
                      <td className="py-2 text-right">
                        <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => startPlace(row.spot)}>
                          {row.configured ? "Edit pin" : "Set pin"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              <Input className="font-mono text-xs" placeholder="campaign slug" value={spotForm.campaign} onChange={(e) => setSpotForm({ ...spotForm, campaign: e.target.value })} />
              <Input className="text-xs" placeholder="label" value={spotForm.label} onChange={(e) => setSpotForm({ ...spotForm, label: e.target.value })} />
              <Input className="font-mono text-xs" placeholder="latitude" value={spotForm.latitude} onChange={(e) => setSpotForm({ ...spotForm, latitude: e.target.value })} />
              <Input className="font-mono text-xs" placeholder="longitude" value={spotForm.longitude} onChange={(e) => setSpotForm({ ...spotForm, longitude: e.target.value })} />
              <Input className="text-xs" placeholder="notes" value={spotForm.notes} onChange={(e) => setSpotForm({ ...spotForm, notes: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { setPicking(true); setMapMode("posters") }}>
                <MapPin className="h-3 w-3" /> Click map
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={saveSpot} disabled={spotSaving}>
                {spotSaving ? "Saving…" : "Save location"}
              </Button>
              {spotMsg && <span className="text-[11px] text-muted-foreground">{spotMsg}</span>}
            </div>
            {(data?.spots ?? []).map((s) => (
              <div key={s.campaign} className="flex justify-between text-[11px] font-mono">
                <span>{s.campaign}</span>
                <button type="button" className="text-destructive/80" onClick={() => deleteSpot(s.campaign)}>Delete</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

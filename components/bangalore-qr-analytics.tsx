"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts"
import { Check, Copy, MapPin, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { DownloadAnalyticsPayload } from "@/lib/download-analytics-types"
import type { QrMapMode } from "@/components/bangalore-qr-map"
import { formatIst } from "@/lib/ist"
import { countryLabel, placeLine } from "@/lib/geo-display"

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

const QR_URL = "https://download.nextquark.in/"

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
  kpis: { today: 0, d7: 0, d30: 0, gps_pins: 0, ip_pins: 0 },
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

export function BangaloreQrAnalytics({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<DownloadAnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [mapMode, setMapMode] = useState<QrMapMode>("clusters")
  const [picking, setPicking] = useState(false)
  const [spotForm, setSpotForm] = useState({ campaign: "", label: "", latitude: "", longitude: "", notes: "" })
  const [spotSaving, setSpotSaving] = useState(false)
  const [spotMsg, setSpotMsg] = useState<string | null>(null)

  const reload = () => {
    setLoading(true)
    fetch("/api/download-analytics")
      .then((r) => r.json())
      .then((json: DownloadAnalyticsPayload) => setData(json))
      .catch(() => setData(EMPTY))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

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

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const kpis = data?.kpis ?? { today: 0, d7: 0, d30: 0, gps_pins: 0, ip_pins: 0 }
  const mapPins = data?.pins.length ?? 0
  const gpsPct = mapPins > 0 ? Math.round((kpis.gps_pins / mapPins) * 100) : 0
  const devices = data?.devices ?? []
  const deviceTotal = devices.reduce((s, d) => s + d.value, 0)
  const tagged = (data?.posters ?? []).filter((p) => p.spot !== "(untagged QR)")
  const showAdvanced = tagged.length > 0 || (data?.spots.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold tracking-tight">Download QR (global)</h2>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Worldwide scans on <code className="font-mono text-[11px]">{QR_URL}</code>. Country, city, locality, and postal code come from Cloudflare when available; map pins use GPS (if allowed) or IP.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4 shadow-[inset_0_1px_0_0_oklch(1_0_0_/_0.04)]">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-2">QR URL</p>
        <div className="flex items-center gap-3 min-w-0">
          <code className="text-sm sm:text-base font-mono truncate flex-1">{QR_URL}</code>
          <CopyBtn value={QR_URL} />
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
        <StatCard label="GPS on map pins" value={mapPins ? `${gpsPct}%` : "—"} sub={`${kpis.gps_pins.toLocaleString()} GPS · ${kpis.ip_pins.toLocaleString()} IP`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Scans by country" sub="ISO country from network geo (last 30 days)">
          <div className="overflow-x-auto max-h-56 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="py-2 pr-3 font-medium">Country</th>
                  <th className="py-2 font-medium text-right">Scans</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byCountry ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-xs text-muted-foreground">No scans yet</td>
                  </tr>
                ) : (
                  data!.byCountry.map((row) => (
                    <tr key={row.country} className="border-b border-border/30 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{countryLabel(row.country === "—" ? null : row.country)}</span>
                        {row.country !== "—" && <span className="text-muted-foreground font-mono text-[10px] ml-1">{row.country}</span>}
                      </td>
                      <td className="py-2 text-right tabular-nums font-semibold">{row.scans.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard title="Recent scans" sub="City, locality, region, country name, postal/PIN when Cloudflare provides them">
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    <th className="py-2 pr-3 font-medium">When (IST)</th>
                    <th className="py-2 pr-3 font-medium">Place</th>
                    <th className="py-2 pr-3 font-medium">Loc</th>
                    <th className="py-2 font-medium">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentVisits ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">No scans yet</td>
                    </tr>
                  ) : (
                    data!.recentVisits.map((row) => (
                      <tr key={row.id} className="border-b border-border/30 last:border-0">
                        <td className="py-2 pr-3 text-[11px] text-muted-foreground whitespace-nowrap">{formatIst(row.created_at)}</td>
                        <td className="py-2 pr-3 text-xs min-w-[12rem]">{placeLine(row) || "—"}</td>
                        <td className="py-2 pr-3 text-[11px] font-mono">{row.location_source === "gps" ? "GPS" : "IP"}</td>
                        <td className="py-2 text-[11px] text-muted-foreground">{row.device_type || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      </div>

      <ChartCard
        title="Global scan map"
        sub="Auto-zooms to your data. Heat = clusters; pins: green = GPS, purple = IP."
      >
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs mb-3">
          Place fields (city, locality, region, country, postal/PIN) are approximate network geo from Cloudflare. Postal code is not always available. Green pins = GPS; purple = IP.
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex rounded-md border border-border/60 overflow-hidden">
            <Button size="sm" variant={mapMode === "clusters" ? "secondary" : "ghost"} className="h-7 text-xs rounded-none" onClick={() => setMapMode("clusters")}>
              Heat
            </Button>
            <Button size="sm" variant={mapMode === "pins" ? "secondary" : "ghost"} className="h-7 text-xs rounded-none" onClick={() => setMapMode("pins")}>
              Pins
            </Button>
            {showAdvanced && (
              <Button size="sm" variant={mapMode === "posters" ? "secondary" : "ghost"} className="h-7 text-xs rounded-none" onClick={() => setMapMode("posters")}>
                By poster
              </Button>
            )}
          </div>
          {picking && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPicking(false)}>
              Cancel pick
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Better pins: scanners tap <strong className="text-foreground/80">Allow</strong> on location (download page, ~2.5s). CARTO is the basemap only — it does not improve GPS/IP accuracy.
        </p>
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
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Scans by hour (IST)" sub="when people open the download page">
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

      <ChartCard title="Device type" sub="mobile vs desktop">
        <div className="h-48 flex items-center gap-2">
          {devices.length === 0 ? (
            <p className="text-xs text-muted-foreground w-full text-center">No device data yet</p>
          ) : (
            <>
              <ResponsiveContainer width="40%" height="100%">
                <PieChart>
                  <Pie data={devices} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3}>
                    {devices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
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

      {showAdvanced && (
        <details className="rounded-xl border border-border/60 bg-card">
          <summary className="px-5 py-3 text-sm font-medium cursor-pointer">
            Advanced: tagged campaigns (?c=)
          </summary>
          <div className="px-5 pb-4 flex flex-col gap-4 border-t border-border/40 pt-3">
            <p className="text-[11px] text-muted-foreground">
              Only if you print different <code className="font-mono">?c=</code> slugs per poster. Single-QR ops can ignore this.
            </p>
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
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

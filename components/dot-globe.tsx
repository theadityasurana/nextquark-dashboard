"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import useSWR from "swr"
import type { DotPoint } from "@/components/dot-globe-impl"

export type { DotPoint }

/** The WebGL globe only runs in the browser. */
export const DotGlobe = dynamic(() => import("@/components/dot-globe-impl"), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full animate-pulse rounded-xl bg-[#070b16]" />,
})

export const GLOBE_WINDOWS = [
  { value: "30m", label: "30 min", long: "last 30 minutes" },
  { value: "1h", label: "1 hour", long: "last hour" },
  { value: "24h", label: "24 hours", long: "last 24 hours" },
  { value: "7d", label: "7 days", long: "last 7 days" },
  { value: "30d", label: "30 days", long: "last 30 days" },
  { value: "90d", label: "90 days", long: "last 90 days" },
]

export const DOT_COLORS = { ip: "#5b82ff", gps: "#3fd06a", user: "#c4a6ff" }

export function WindowPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
      {GLOBE_WINDOWS.map(w => (
        <button key={w.value} type="button" onClick={() => onChange(w.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${value === w.value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>
          {w.label}
        </button>
      ))}
    </div>
  )
}

type LivePoints = {
  window: string
  visits: number
  activeUsers: number
  visitPoints: { lat: number; lng: number; gps: boolean }[]
  userPoints: { lat: number; lng: number }[]
}

/** Turns the live API's points into globe dots (blue = IP, green = GPS, violet = active user). */
export function toDots(d?: Partial<LivePoints>): DotPoint[] {
  return [
    ...(d?.visitPoints ?? []).map(p => ({ lat: p.lat, lng: p.lng, color: p.gps ? DOT_COLORS.gps : DOT_COLORS.ip, r: p.gps ? 0.16 : 0.13 })),
    ...(d?.userPoints ?? []).map(p => ({ lat: p.lat, lng: p.lng, color: DOT_COLORS.user, r: 0.2 })),
  ]
}

export function DotLegend({ users = true }: { users?: boolean }) {
  const dot = (c: string) => <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
  return (
    <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">{dot(DOT_COLORS.ip)}Visit (IP location)</span>
      <span className="inline-flex items-center gap-1.5">{dot(DOT_COLORS.gps)}Visit (GPS)</span>
      {users && <span className="inline-flex items-center gap-1.5">{dot(DOT_COLORS.user)}Active app user</span>}
    </span>
  )
}

/** A self-contained visit globe with its own time filter (used in Link & QR visits). */
export function VisitGlobePanel() {
  const [win, setWin] = useState("7d")
  const long = GLOBE_WINDOWS.find(w => w.value === win)?.long ?? ""
  const { data } = useSWR<LivePoints>(`/api/marketing/live?window=${win}&users=0`, (u: string) => fetch(u).then(r => r.json()), {
    refreshInterval: ["30m", "1h"].includes(win) ? 20_000 : 120_000, keepPreviousData: true,
  })
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm"><b className="tabular-nums">{data ? data.visits.toLocaleString() : "–"}</b> <span className="text-muted-foreground">visits · {long}</span></span>
          <DotLegend users={false} />
        </div>
        <WindowPicker value={win} onChange={setWin} />
      </div>
      <DotGlobe points={toDots(data)} height={520} />
    </div>
  )
}

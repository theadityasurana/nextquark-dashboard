"use client"

/**
 * Per-portal circuit-breaker status.
 *
 * Answers the question that previously required reading failed runs one by one:
 * "is this portal broken right now, or was that one application unlucky?" A
 * paused portal here means the queue has already stopped dispatching to it, so
 * the strip doubles as an explanation for why those cards aren't moving.
 */

import { useEffect, useState } from "react"
import { Activity, CircleCheck, CircleSlash, TriangleAlert } from "lucide-react"

interface PortalHealth {
  portal: string
  state: "closed" | "open" | "halfOpen"
  consecutiveFailures: number
  lastError: string | null
  lastSuccessAt: string | null
  label: string
  tone: "ok" | "degraded" | "down"
}

const TONE: Record<PortalHealth["tone"], { icon: typeof CircleCheck; cls: string }> = {
  ok: { icon: CircleCheck, cls: "text-green-600 border-green-500/30 bg-green-500/5" },
  degraded: { icon: TriangleAlert, cls: "text-orange-500 border-orange-500/30 bg-orange-500/5" },
  down: { icon: CircleSlash, cls: "text-destructive border-destructive/30 bg-destructive/5" },
}

export function PortalHealthStrip() {
  const [portals, setPortals] = useState<PortalHealth[] | null>(null)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/portal-health")
        const data = await res.json()
        if (cancelled) return
        setPortals(data.portals ?? [])
        setAvailable(data.available !== false)
      } catch {
        if (!cancelled) setPortals([])
      }
    }
    load()
    // A breaker's countdown ticks in minutes; 30s is plenty.
    const interval = setInterval(() => { if (!document.hidden) load() }, 60_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (portals === null) return null

  // Migration not applied yet — say so rather than showing a misleading
  // "everything is healthy" strip built from no data.
  if (!available) {
    return (
      <div className="panel px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Portal health is unavailable — apply{" "}
            <code className="font-mono">scripts/055_add_preflight_gating.sql</code> to enable it.
          </p>
      </div>
    )
  }

  if (portals.length === 0) return null

  // Unhealthy portals lead: a paused portal is the actionable thing here.
  const sorted = [...portals].sort((a, b) => {
    const rank = { down: 0, degraded: 1, ok: 2 }
    return rank[a.tone] - rank[b.tone] || a.portal.localeCompare(b.portal)
  })
  const unhealthy = sorted.filter((p) => p.tone !== "ok").length

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className={`h-2 w-2 rounded-full ${unhealthy > 0 ? "bg-orange-500" : "bg-success"}`} />
          <h3 className="text-sm font-semibold tracking-tight">Portal health</h3>
          <span className="text-xs text-muted-foreground">
            {unhealthy > 0 ? `${unhealthy} of ${sorted.length} need attention` : `All ${sorted.length} portals dispatching`}
          </span>
        </div>
        <Activity className="h-4 w-4 text-muted-foreground/60" />
      </div>
      <div className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {sorted.map((p) => {
          const { icon: Icon } = TONE[p.tone]
          const color = p.tone === "ok" ? "text-success" : p.tone === "degraded" ? "text-orange-500" : "text-destructive"
          return (
            <div
              key={p.portal}
              className="flex min-w-0 items-center gap-2 border-b border-r border-border px-4 py-3"
              title={p.lastError ? `Last error: ${p.lastError}` : undefined}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{p.portal}</p>
                <p className={`truncate text-[11px] ${p.tone === "ok" ? "text-muted-foreground" : color}`}>{p.label}</p>
              </div>
            </div>
          )
        })}
      </div>
      {unhealthy > 0 && (
        <p className="border-t border-border bg-muted/30 px-5 py-2.5 text-[11px] text-muted-foreground">
          Paused portals are not being dispatched to. A single probe run is admitted when the
          cooldown expires; if it succeeds, normal dispatch resumes automatically.
        </p>
      )}
    </div>
  )
}

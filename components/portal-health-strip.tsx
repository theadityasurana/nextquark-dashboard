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
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
    const interval = setInterval(load, 30_000)
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
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            Portal health is unavailable — apply{" "}
            <code className="font-mono">scripts/055_add_preflight_gating.sql</code> to enable it.
          </p>
        </CardContent>
      </Card>
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
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="h-3 w-3" /> Portal Health
          </h3>
          {unhealthy > 0 ? (
            <Badge variant="outline" className="text-[10px] text-orange-500 border-orange-500/30">
              {unhealthy} needing attention
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-green-600 border-green-500/30">
              All healthy
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {sorted.map((p) => {
            const { icon: Icon, cls } = TONE[p.tone]
            return (
              <div
                key={p.portal}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 ${cls}`}
                title={p.lastError ? `Last error: ${p.lastError}` : undefined}
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span className="text-[11px] font-medium">{p.portal}</span>
                <span className="text-[10px] opacity-80">{p.label}</span>
              </div>
            )
          })}
        </div>

        {unhealthy > 0 && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            Paused portals are not being dispatched to. A single probe run is admitted when the
            cooldown expires; if it succeeds, normal dispatch resumes automatically.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

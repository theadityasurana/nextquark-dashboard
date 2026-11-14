"use client"

import { useEffect, useState, useCallback } from "react"
import { AlertTriangle, CheckCircle2, XCircle, RefreshCw, ShieldAlert } from "lucide-react"

type ServiceStatus = 'healthy' | 'degraded' | 'down'

interface Service {
  name: string
  status: ServiceStatus
  latencyMs: number
  detail?: string
}

interface HealthData {
  overallStatus: ServiceStatus
  services: Service[]
  alerts: string[]
  errorStats: { httpErrorRate: number; totalErrors: number; authErrors: number }
  checkedAt: string
}

const statusConfig: Record<ServiceStatus, { color: string; dot: string; icon: React.ElementType }> = {
  healthy:  { color: 'text-success',        dot: 'bg-success',      icon: CheckCircle2 },
  degraded: { color: 'text-warning',        dot: 'bg-warning',     icon: AlertTriangle },
  down:     { color: 'text-destructive',    dot: 'bg-destructive',    icon: XCircle },
}

// Last result in memory, so the card has something to show when you return to the tab.
let lastHealth: HealthData | null = null

export function SystemHealthPanel() {
  const [health, setHealth] = useState<HealthData | null>(lastHealth)
  const [loading, setLoading] = useState(!lastHealth)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/system-health')
      const json = await res.json()
      lastHealth = json
      setHealth(json)
      // Keep the header status pill in sync with what this panel shows.
      window.dispatchEvent(new CustomEvent('iris:health', { detail: json.overallStatus }))
    } catch {
      // silently fail — panel just stays in loading state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 60_000) // auto-refresh every 60s
    return () => clearInterval(interval)
  }, [fetchHealth])

  if (loading) {
    return (
      <div className="panel flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking system health…
      </div>
    )
  }

  if (!health) return null

  const overall = statusConfig[health.overallStatus]
  const label = health.overallStatus === 'healthy' ? 'All systems operational' : health.overallStatus === 'degraded' ? 'Degraded performance' : 'Service disruption'

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            {health.overallStatus === 'healthy' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${overall.dot}`} />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${overall.dot}`} />
          </span>
          <span className="text-sm font-semibold tracking-tight">{label}</span>
          <span className="hidden sm:inline text-xs text-muted-foreground">· Supabase infrastructure</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          Checked {new Date(health.checkedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {health.alerts.length > 0 && (
        <div className="flex flex-col gap-1.5 border-b border-border px-5 py-3">
          {health.alerts.map((alert, i) => (
            <div key={i} className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <span className="text-xs text-destructive">{alert}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 divide-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
        {health.services.map(svc => {
          const cfg = statusConfig[svc.status]
          const Icon = cfg.icon
          return (
            <div key={svc.name} className="flex flex-col gap-2 px-5 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground">{svc.name}</span>
                <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
              </div>
              {/* Latency against a 1s budget, coloured by current status */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${cfg.dot}`} style={{ width: `${Math.max(4, Math.min(100, svc.latencyMs / 10))}%` }} />
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                <span className={`capitalize ${cfg.color}`}>{svc.status}</span> · {svc.latencyMs}ms
              </span>
            </div>
          )
        })}
      </div>

      {(health.errorStats.httpErrorRate > 0 || health.errorStats.authErrors > 0) && (
        <div className="flex flex-wrap items-center gap-4 border-t border-border bg-muted/30 px-5 py-2.5 text-xs text-muted-foreground">
          <span>Last 15 min</span>
          <span className={health.errorStats.httpErrorRate > 20 ? 'font-medium text-destructive' : ''}>
            Error rate {health.errorStats.httpErrorRate}%
          </span>
          <span className={health.errorStats.authErrors > 5 ? 'font-medium text-destructive' : ''}>
            Auth errors {health.errorStats.authErrors}
          </span>
        </div>
      )}
    </div>
  )
}

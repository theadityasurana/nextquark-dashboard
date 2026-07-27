"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  healthy:  { color: 'text-green-500',      dot: 'bg-green-500',      icon: CheckCircle2 },
  degraded: { color: 'text-yellow-500',     dot: 'bg-yellow-500',     icon: AlertTriangle },
  down:     { color: 'text-destructive',    dot: 'bg-destructive',    icon: XCircle },
}

export function SystemHealthPanel() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/system-health')
      const json = await res.json()
      setHealth(json)
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
      <Card className="bg-card border-border">
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking system health…
        </CardContent>
      </Card>
    )
  }

  if (!health) return null

  const overall = statusConfig[health.overallStatus]

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              {health.overallStatus === 'healthy' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${overall.dot}`} />
            </span>
            <CardTitle className="text-sm font-medium">Supabase System Health</CardTitle>
          </div>
          <span className={`text-xs font-medium capitalize ${overall.color}`}>{health.overallStatus}</span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-0">
        {/* Alert banners */}
        {health.alerts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {health.alerts.map((alert, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                <ShieldAlert className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                <span className="text-xs text-destructive">{alert}</span>
              </div>
            ))}
          </div>
        )}

        {/* Per-service grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {health.services.map(svc => {
            const cfg = statusConfig[svc.status]
            const Icon = cfg.icon
            return (
              <div key={svc.name} className="flex flex-col gap-1 rounded-lg bg-accent/40 px-3 py-2.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground">{svc.name}</span>
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${cfg.color}`} />
                </div>
                <span className={`text-xs font-semibold capitalize ${cfg.color}`}>{svc.status}</span>
                <span className="text-[10px] text-muted-foreground">{svc.latencyMs}ms</span>
              </div>
            )
          })}
        </div>

        {/* Error rate summary */}
        {(health.errorStats.httpErrorRate > 0 || health.errorStats.authErrors > 0) && (
          <div className="flex items-center gap-4 rounded-md bg-accent/30 px-3 py-2 text-xs text-muted-foreground">
            <span>Last 15 min:</span>
            <span className={health.errorStats.httpErrorRate > 20 ? 'text-destructive font-medium' : ''}>
              Error rate: {health.errorStats.httpErrorRate}%
            </span>
            <span className={health.errorStats.authErrors > 5 ? 'text-destructive font-medium' : ''}>
              Auth errors: {health.errorStats.authErrors}
            </span>
            <span className="ml-auto">
              Checked {new Date(health.checkedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

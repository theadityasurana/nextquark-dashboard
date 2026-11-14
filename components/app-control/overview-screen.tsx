"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { AlertTriangle, History, Pencil, RefreshCw, Smartphone } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { deepEqual, type ConfigRow } from "@/lib/remote-config/core"
import { SECTIONS } from "@/lib/remote-config/fields"
import { errorMessage, rcApi } from "./api"
import { HelpPanel } from "./help-panel"
import { QuickActions } from "./quick-actions"

export const sectionHref = (key: string) => `/app-control/${encodeURIComponent(key)}`

export function AppControlOverview() {
  const [rows, setRows] = useState<Record<string, ConfigRow> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await rcApi.all()
      setRows(Object.fromEntries(data.map(r => [r.key, r])))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const onSaved = (row: ConfigRow) => setRows(r => (r ? { ...r, [row.key]: row } : r))
  const versionsKey = rows ? Object.values(rows).map(r => `${r.key}:${r.version}`).join("|") : ""

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">App Control</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Control what Iris app users see, without shipping an app update.</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpPanel />
          <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        </div>
      </div>

      <div className="panel/50 p-3 text-xs text-muted-foreground flex gap-2.5">
        <Smartphone className="h-4 w-4 shrink-0 text-primary mt-px" />
        <p>
          Users see changes within about <strong className="text-foreground">5 minutes</strong> (limits apply immediately).
          Changes are <strong className="text-foreground">not retroactive</strong> for existing balances.
          <strong className="text-foreground"> Prices can&apos;t be changed here</strong>: they come from the App Store and Google Play.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-destructive">Couldn&apos;t load remote config</p>
            <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={load}>Try again</Button>
        </div>
      )}

      {rows && Object.keys(rows).length > 0 && <QuickActions key={versionsKey} rows={rows} onSaved={onSaved} />}

      <div>
        <h2 className="text-sm font-medium mb-3">Sections</h2>
        {loading && !rows ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{SECTIONS.map(s => <Skeleton key={s.key} className="h-36 rounded-lg" />)}</div>
        ) : rows && Object.keys(rows).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            The remote_config table is empty. Run the migration <code className="font-mono">20251102000000_remote_config.sql</code> (supabase db push) to seed it.
          </div>
        ) : rows ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SECTIONS.map(s => {
              const row = rows[s.key]
              const modified = row ? !deepEqual(row.value, row.default_value) : false
              return (
                <Card key={s.key} className="bg-card border-border flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-medium">{s.name}</CardTitle>
                        <code className="text-[10px] text-muted-foreground font-mono">{s.key}</code>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {s.highImpact && <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">high impact</Badge>}
                        {modified && <Badge className="text-[10px] bg-primary/15 text-primary border border-primary/25">Modified</Badge>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 flex-1">
                    <p className="text-xs text-muted-foreground">{row?.description ?? s.blurb}</p>
                    {row ? (
                      <p className="text-[11px] text-muted-foreground mt-auto">
                        <span className="font-mono text-foreground">v{row.version}</span> · updated {formatDistanceToNow(new Date(row.updated_at), { addSuffix: true })} by {row.updated_by ?? "unknown"}
                      </p>
                    ) : (
                      <p className="text-[11px] text-destructive mt-auto">Missing from the database.</p>
                    )}
                    <div className="flex gap-2">
                      <Button asChild size="sm" className="h-8 flex-1" disabled={!row}><Link href={sectionHref(s.key)}><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Link></Button>
                      <Button asChild size="sm" variant="outline" className="h-8"><Link href={`${sectionHref(s.key)}/history`}><History className="h-3.5 w-3.5 mr-1.5" />History</Link></Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}

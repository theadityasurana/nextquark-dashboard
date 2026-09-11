"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Loader2, Building2, X, Plus, RefreshCw, Trash2 } from "lucide-react"

interface SyncSession {
  id: string
  type: "sync" | "cleanup" | "enrich"
  status: "running" | "done" | "failed"
  total: number
  done: number
  failed: number
  added: number
  updated: number
  deleted: number
  results: Array<{
    company: string
    added?: number
    updated?: number
    deleted?: number
    checked?: number
    total?: number
    error?: string
    inProgress?: boolean
  }>
}

interface Props {
  sessionId: string
  mode?: "sync" | "cleanup" | "enrich"
  onComplete?: (session: SyncSession) => void
  onDismiss?: () => void
}

export function SyncProgressBar({ sessionId, mode = "sync", onComplete, onDismiss }: Props) {
  const [session, setSession] = useState<SyncSession | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    supabase
      .from("sync_sessions")
      .select("*")
      .eq("id", sessionId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error("[SyncProgressBar] initial fetch error:", error.message, error.code)
          setFetchError(error.message)
        }
        if (data) setSession(data as SyncSession)
      })

    const channel = supabase
      .channel(`sync_session:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sync_sessions", filter: `id=eq.${sessionId}` },
        (payload) => {
          const updated = payload.new as SyncSession
          setSession(updated)
          if (updated.status !== "running") onComplete?.(updated)
        }
      )
      .subscribe((status, err) => {
        if (err) console.error("[SyncProgressBar] realtime error:", err)
      })

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, onComplete])

  const pct = session && session.total > 0 ? Math.round((session.done / session.total) * 100) : 0
  const isRunning = !session || session.status === "running"
  const isCleanup = session ? session.type === "cleanup" : mode === "cleanup"
  const isEnrich  = session ? session.type === "enrich"  : mode === "enrich"

  // Running totals from results array (more accurate than top-level counters mid-run)
  const totalAdded   = (session?.results ?? []).reduce((s, r) => s + (r.added   ?? 0), 0)
  const totalUpdated = (session?.results ?? []).reduce((s, r) => s + (r.updated ?? 0), 0)
  const totalDeleted = (session?.results ?? []).reduce((s, r) => s + (r.deleted ?? 0), 0)
  const totalChecked = (session?.results ?? []).reduce((s, r) => s + (r.checked ?? r.total ?? 0), 0)
  const succeeded    = (session?.done ?? 0) - (session?.failed ?? 0)

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning
            ? <Loader2 className="h-4 w-4 text-primary animate-spin" />
            : session?.failed === session?.total && (session?.total ?? 0) > 0
              ? <XCircle className="h-4 w-4 text-destructive" />
              : <CheckCircle2 className="h-4 w-4 text-green-500" />
          }
          <span className="text-sm font-medium">
            {fetchError
              ? `Error loading session: ${fetchError}`
              : isRunning
                ? isEnrich ? "Classifying experience levels…" : isCleanup ? "Cleaning up stale jobs…" : "Syncing jobs…"
                : session?.failed ? `${isEnrich ? "Enrichment" : isCleanup ? "Cleanup" : "Sync"} completed with errors`
                  : `${isEnrich ? "Enrichment" : isCleanup ? "Cleanup" : "Sync"} complete`
            }
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {session
              ? isEnrich
                ? `${session.done}/${session.total} jobs`
                : `${session.done}/${session.total} companies`
              : "starting…"}
          </span>
          {!isRunning && onDismiss && (
            <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <Progress value={pct} className="h-1.5" />

      {/* Live counters */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1 text-green-500">
          <CheckCircle2 className="h-3 w-3" /> {succeeded} succeeded
        </span>
        {(session?.failed ?? 0) > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <XCircle className="h-3 w-3" /> {session!.failed} failed
          </span>
        )}
        {isEnrich ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1 text-green-500">
              <CheckCircle2 className="h-3 w-3" /> {session?.updated ?? 0} classified
            </span>
            {(session?.failed ?? 0) > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="h-3 w-3" /> {session!.failed} failed
                </span>
              </>
            )}
          </>
        ) : isCleanup ? (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Trash2 className="h-3 w-3" /> {totalDeleted} deleted
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{totalChecked} checked</span>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1 text-green-500">
              <Plus className="h-3 w-3" /> {totalAdded} added
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <RefreshCw className="h-3 w-3" /> {totalUpdated} updated
            </span>
            {totalDeleted > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Trash2 className="h-3 w-3" /> {totalDeleted} removed
                </span>
              </>
            )}
          </>
        )}
      </div>

      {/* Per-company results */}
      {(session?.results?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {(session!.results ?? []).map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-md bg-accent/40 px-3 py-1.5 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground truncate mr-2">
                <Building2 className="h-3 w-3 shrink-0" />
                {r.company}
              </span>
              {r.error ? (
                <Badge variant="destructive" className="text-[10px] h-4 shrink-0">{r.error.slice(0, 40)}</Badge>
              ) : r.inProgress ? (
                <span className="flex items-center gap-1 text-muted-foreground tabular-nums shrink-0">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  +{r.added ?? 0} · ↻{r.updated ?? 0}
                </span>
              ) : isCleanup ? (
                <span className="text-muted-foreground tabular-nums shrink-0">
                  {r.deleted ?? 0} deleted · {r.checked ?? 0} checked
                </span>
              ) : (
                <span className="text-muted-foreground tabular-nums shrink-0">
                  +{r.added ?? 0} · ↻{r.updated ?? 0} · {r.total ?? 0} live
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

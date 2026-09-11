"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Loader2, Building2 } from "lucide-react"

interface SyncSession {
  id: string
  status: "running" | "done" | "failed"
  total: number
  done: number
  failed: number
  added: number
  updated: number
  results: Array<{ company: string; added?: number; updated?: number; total?: number; error?: string }>
}

interface Props {
  sessionId: string
  onComplete?: (session: SyncSession) => void
}

export function SyncProgressBar({ sessionId, onComplete }: Props) {
  const [session, setSession] = useState<SyncSession | null>(null)

  useEffect(() => {
    const supabase = createClient()

    // Fetch initial state
    supabase
      .from("sync_sessions")
      .select("*")
      .eq("id", sessionId)
      .single()
      .then(({ data }) => { if (data) setSession(data as SyncSession) })

    // Subscribe to row-level changes
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
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, onComplete])

  if (!session) return null

  const processed = session.done
  const pct = session.total > 0 ? Math.round((processed / session.total) * 100) : 0
  const succeeded = processed - session.failed
  const isRunning = session.status === "running"

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRunning
            ? <Loader2 className="h-4 w-4 text-primary animate-spin" />
            : session.failed === session.total && session.total > 0
              ? <XCircle className="h-4 w-4 text-destructive" />
              : <CheckCircle2 className="h-4 w-4 text-green-500" />
          }
          <span className="text-sm font-medium">
            {isRunning ? "Syncing jobs…" : session.failed > 0 ? "Sync completed with errors" : "Sync complete"}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{processed}/{session.total} companies</span>
      </div>

      <Progress value={pct} className="h-2" />

      <div className="flex items-center gap-3 text-xs">
        <span className="flex items-center gap-1 text-green-500">
          <CheckCircle2 className="h-3 w-3" /> {succeeded} succeeded
        </span>
        {session.failed > 0 && (
          <span className="flex items-center gap-1 text-destructive">
            <XCircle className="h-3 w-3" /> {session.failed} failed
          </span>
        )}
        {!isRunning && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">+{session.added} new jobs</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{session.updated} updated</span>
          </>
        )}
      </div>

      {/* Per-company results — only show once at least one has finished */}
      {session.results.length > 0 && (
        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
          {session.results.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-md bg-accent/40 px-3 py-1.5 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                {r.company}
              </span>
              {r.error ? (
                <Badge variant="destructive" className="text-[10px] h-4">{r.error.slice(0, 40)}</Badge>
              ) : (
                <span className="text-muted-foreground tabular-nums">
                  +{r.added ?? 0} new · {r.updated ?? 0} updated · {r.total ?? 0} live
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

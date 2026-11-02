"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { format, formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, ChevronDown, Loader2, Pencil, RefreshCw, RotateCcw, ShieldAlert, Undo2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { deepEqual, diff, impactSentences, type ConfigRow, type HistoryRow, type JsonObject } from "@/lib/remote-config/core"
import { sectionDef } from "@/lib/remote-config/fields"
import { ApiError, errorMessage, rcApi } from "./api"
import { DiffView } from "./diff-view"
import { sectionHref } from "./overview-screen"
import { savedMessage } from "./save-dialog"

type Pending =
  | { kind: "rollback"; version: number; target: JsonObject }
  | { kind: "reset"; target: JsonObject }

export function SectionHistory({ sectionKey }: { sectionKey: string }) {
  const def = sectionDef(sectionKey)
  const [row, setRow] = useState<ConfigRow | null>(null)
  const [history, setHistory] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [pending, setPending] = useState<Pending | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [r, h] = await Promise.all([rcApi.one(sectionKey), rcApi.history(sectionKey)])
      setRow(r)
      setHistory(h)
      setExpanded(e => (e.size ? e : new Set(h.slice(0, 1).map(x => x.id))))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [sectionKey])

  useEffect(() => { load() }, [load])

  if (!def) return <p className="text-sm text-muted-foreground">Unknown section <code className="font-mono">{sectionKey}</code>.</p>

  const toggle = (id: number) => setExpanded(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex flex-col gap-3">
        <Link href="/app-control" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"><ArrowLeft className="h-3 w-3" />App Control</Link>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gradient">History · {def.name}</h1>
            <p className="text-[11px] text-muted-foreground mt-1">
              <code className="font-mono">{sectionKey}</code>{row && <> · now <span className="font-mono text-foreground">v{row.version}</span></>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}><RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />Refresh</Button>
            <Button asChild variant="outline" size="sm" className="h-8"><Link href={sectionHref(sectionKey)}><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Link></Button>
            <Button
              variant="outline" size="sm" className="h-8 text-warning border-warning/40 hover:bg-warning/10"
              disabled={!row || deepEqual(row.value, row.default_value)}
              onClick={() => row && setPending({ kind: "reset", target: row.default_value })}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reset section to default
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex-1"><p className="font-medium text-destructive">Couldn&apos;t load history</p><p className="text-xs text-muted-foreground mt-0.5">{error}</p></div>
          <Button size="sm" variant="outline" onClick={load}>Try again</Button>
        </div>
      )}

      {loading && !history ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : history && history.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No history yet.</div>
      ) : history && row ? (
        <ol className="flex flex-col gap-2">
          {history.map(h => {
            const open = expanded.has(h.id)
            const isCurrent = h.version === row.version && deepEqual(h.new_value, row.value)
            const changes = diff(h.old_value, h.new_value).length
            return (
              <li key={h.id} className={cn("rounded-lg border bg-card", isCurrent ? "border-primary/40" : "border-border")}>
                <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => toggle(h.id)} aria-expanded={open}>
                  <span className="font-mono text-sm w-10 shrink-0">v{h.version}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{h.note || <span className="text-muted-foreground italic">no note</span>}</p>
                    <p className="text-[11px] text-muted-foreground" title={format(new Date(h.changed_at), "PPpp")}>
                      {h.changed_by ?? "unknown"} · {formatDistanceToNow(new Date(h.changed_at), { addSuffix: true })} · {h.old_value === null ? "initial value" : `${changes} field${changes === 1 ? "" : "s"} changed`}
                    </p>
                  </div>
                  {isCurrent && <Badge className="text-[10px] bg-primary/15 text-primary border border-primary/25">current</Badge>}
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
                {open && (
                  <div className="border-t border-border/60 px-4 py-3 flex flex-col gap-3">
                    {h.old_value === null
                      ? <p className="text-xs text-muted-foreground">First recorded value (seeded by the migration).</p>
                      : <DiffView before={h.old_value} after={h.new_value} />}
                    {!isCurrent && (
                      <Button size="sm" variant="outline" className="h-8 w-fit" onClick={() => setPending({ kind: "rollback", version: h.version, target: h.new_value })}>
                        <Undo2 className="h-3.5 w-3.5 mr-1.5" />Restore this version
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      ) : null}

      {pending && row && (
        <ConfirmRestore
          sectionKey={sectionKey}
          row={row}
          pending={pending}
          onClose={() => setPending(null)}
          onDone={() => { setPending(null); load() }}
        />
      )}
    </div>
  )
}

function ConfirmRestore({ sectionKey, row, pending, onClose, onDone }: {
  sectionKey: string
  row: ConfigRow
  pending: Pending
  onClose: () => void
  onDone: () => void
}) {
  const [note, setNote] = useState(pending.kind === "reset" ? "reset to default" : `rollback to v${pending.version}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ack, setAck] = useState(false)
  const impact = impactSentences(sectionKey, row.value, pending.target, row.default_value)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = pending.kind === "reset"
        ? await rcApi.reset(sectionKey, note, row.version)
        : await rcApi.rollback(sectionKey, pending.version, note, row.version)
      if (res.changed) toast.success(savedMessage(sectionKey, res.row.version))
      else toast.info("Nothing changed: the section already had this value.")
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(`${err.message} Close this dialog and refresh to see their change first.`)
      else if (err instanceof ApiError && err.status === 404) setError(`${err.message} Refresh the history.`)
      else setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pending.kind === "reset" ? "Reset section to default?" : `Restore version ${pending.version}?`}</DialogTitle>
          <DialogDescription>
            This saves a new version (v{row.version + 1}) of <code className="font-mono">{sectionKey}</code>. History is kept, so you can undo it the same way.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-medium mb-1.5">What changes compared with now (v{row.version})</p>
            <DiffView before={row.value} after={pending.target} empty="No changes: the section already has this value." />
          </div>
          {impact.length > 0 && (
            <label className="flex gap-2.5 rounded-md border border-warning/50 bg-warning/5 p-3 cursor-pointer">
              <Checkbox checked={ack} onCheckedChange={c => setAck(c === true)} className="mt-0.5" />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium"><ShieldAlert className="h-4 w-4 text-warning" /> I understand what users will see:</span>
                <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">{impact.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </span>
            </label>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-restore-note" className="text-xs">Note for history</Label>
            <Input id="rc-restore-note" value={note} maxLength={500} onChange={e => setNote(e.target.value)} />
          </div>
          {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy || (impact.length > 0 && !ack)} variant={pending.kind === "reset" ? "destructive" : "default"}>
            {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : pending.kind === "reset" ? "Reset to default" : `Restore v${pending.version}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

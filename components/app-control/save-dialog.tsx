"use client"

// The one save flow (doc §8.3), used by the section editor and quick actions:
//   validate (DB + §8.4) → review diff + note → high-impact confirmation →
//   re-read for conflicts → save → toast with the new version.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Loader2, ShieldAlert, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { checkSection, deepEqual, impactSentences, setAt, type ConfigRow, type Issue, type Json, type JsonObject } from "@/lib/remote-config/core"
import { ApiError, errorMessage, rcApi } from "./api"
import { DiffView } from "./diff-view"

export type PendingChange =
  | { kind: "section"; value: JsonObject }
  | { kind: "field"; path: string[]; value: Json }

export function applyChange(base: JsonObject, change: PendingChange): JsonObject {
  return change.kind === "section" ? change.value : setAt(base, change.path, change.value)
}

export function savedMessage(key: string, version: number) {
  return key === "limits"
    ? `Saved as version ${version}. The database applies it right away, on the next swipe, follow claim or referral.`
    : `Saved as version ${version}. Users will see it within about 5 minutes.`
}

type Stage =
  | { s: "checking" }
  | { s: "invalid"; problems: string[]; errors: Issue[] }
  | { s: "review" }
  | { s: "conflict"; fresh: ConfigRow }
  | { s: "saving" }
  | { s: "error"; message: string }

export function SaveDialog({
  open, onOpenChange, sectionKey, sectionName, loaded, change, title, reminder, defaultNote = "", onSaved, onProblems,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  sectionKey: string
  sectionName: string
  /** The row as it was when editing started (its version is the conflict baseline). */
  loaded: ConfigRow
  change: PendingChange | null
  title?: string
  reminder?: string
  defaultNote?: string
  onSaved: (row: ConfigRow) => void
  /** Lets the editor show DB problems next to fields. */
  onProblems?: (problems: string[]) => void
}) {
  const [stage, setStage] = useState<Stage>({ s: "checking" })
  const [note, setNote] = useState(defaultNote)
  const [ack, setAck] = useState(false)
  const [base, setBase] = useState<ConfigRow>(loaded)

  const next = useMemo(() => (change ? applyChange(base.value, change) : base.value), [base, change])
  const warnings = useMemo(() => checkSection(sectionKey, next, base.default_value, base.value).filter(i => i.severity === "warning"), [sectionKey, next, base])
  const impact = useMemo(() => impactSentences(sectionKey, base.value, next, base.default_value), [sectionKey, base, next])
  const noChange = deepEqual(next, base.value)

  // Step 1: validate whenever the dialog opens.
  useEffect(() => {
    if (!open || !change) return
    let cancelled = false
    setBase(loaded)
    setNote(defaultNote)
    setAck(false)
    setStage({ s: "checking" })
    const value = applyChange(loaded.value, change)
    const errors = checkSection(sectionKey, value, loaded.default_value, loaded.value).filter(i => i.severity === "error")
    rcApi.validate(sectionKey, value)
      .then(({ problems }) => {
        if (cancelled) return
        onProblems?.(problems)
        setStage(problems.length || errors.length ? { s: "invalid", problems, errors } : { s: "review" })
      })
      .catch(err => !cancelled && setStage({ s: "error", message: errorMessage(err) }))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, change, loaded, sectionKey])

  const save = async (expected: ConfigRow) => {
    if (!change) return
    setStage({ s: "saving" })
    try {
      // Step 3: re-read; someone may have saved since we loaded.
      const fresh = await rcApi.one(sectionKey)
      if (fresh.version !== expected.version) {
        setStage({ s: "conflict", fresh })
        return
      }
      const res = change.kind === "field"
        ? await rcApi.field(sectionKey, change.path, change.value, note, fresh.version)
        : await rcApi.set(sectionKey, next, note, fresh.version)
      if (!res.changed) toast.info("Nothing changed: the saved value was already the same.")
      else toast.success(savedMessage(sectionKey, res.row.version))
      onSaved(res.row)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.body.row) {
        setStage({ s: "conflict", fresh: err.body.row as ConfigRow })
        return
      }
      if (err instanceof ApiError && err.status === 400) {
        const problems = [err.message]
        onProblems?.(problems)
        setStage({ s: "invalid", problems, errors: [] })
        return
      }
      setStage({ s: "error", message: errorMessage(err) })
    }
  }

  const needsAck = impact.length > 0
  const canSave = stage.s === "review" && !noChange && (!needsAck || ack)

  return (
    <Dialog open={open} onOpenChange={o => stage.s !== "saving" && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title ?? `Review changes · ${sectionName}`}</DialogTitle>
          <DialogDescription>
            Section <code className="font-mono">{sectionKey}</code>, currently version {base.version}. Nothing is saved until you confirm.
          </DialogDescription>
        </DialogHeader>

        {stage.s === "checking" && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Validating with the database…</div>
        )}

        {stage.s === "error" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex gap-2"><XCircle className="h-4 w-4 mt-0.5 shrink-0" />{stage.message}</div>
        )}

        {stage.s === "invalid" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-destructive">Fix these before saving:</p>
            <ul className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {stage.problems.map((p, i) => <li key={`p${i}`} className="font-mono">{p}</li>)}
              {stage.errors.map((e, i) => <li key={`e${i}`}><code className="font-mono">{e.path.join(".")}</code>: {e.message}</li>)}
            </ul>
          </div>
        )}

        {stage.s === "conflict" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="font-medium">Someone else saved this section while you were editing.</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Now version {stage.fresh.version}, by {stage.fresh.updated_by ?? "unknown"} at {new Date(stage.fresh.updated_at).toLocaleString()}. You loaded version {base.version}.
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium mb-1.5">Their change</p>
              <DiffView before={base.value} after={stage.fresh.value} />
            </div>
            <div>
              <p className="text-xs font-medium mb-1.5">
                {change?.kind === "field" ? "Your change applied on top of theirs" : "What saving your version would do now (overwrites their change)"}
              </p>
              <DiffView before={stage.fresh.value} after={change ? applyChange(stage.fresh.value, change) : stage.fresh.value} />
            </div>
          </div>
        )}

        {(stage.s === "review" || stage.s === "saving") && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium mb-1.5">Changes</p>
              <DiffView before={base.value} after={next} empty="No changes: this matches what's saved." />
            </div>
            {warnings.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
                {warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-px" /><span><code className="font-mono">{w.path.join(".")}</code>: {w.message}</span></li>)}
              </ul>
            )}
            {reminder && <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs">{reminder}</p>}
            {needsAck && (
              <label className="flex gap-2.5 rounded-md border border-warning/50 bg-warning/5 p-3 cursor-pointer">
                <Checkbox checked={ack} onCheckedChange={c => setAck(c === true)} className="mt-0.5" />
                <span className="text-sm">
                  <span className="flex items-center gap-1.5 font-medium"><ShieldAlert className="h-4 w-4 text-warning" /> I understand what users will see:</span>
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">{impact.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </span>
              </label>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rc-note" className="text-xs">Note for history (optional)</Label>
              <Input id="rc-note" value={note} maxLength={500} placeholder='e.g. "Diwali promo"' onChange={e => setNote(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={stage.s === "saving"}>
            {stage.s === "invalid" ? "Back to editing" : "Cancel"}
          </Button>
          {stage.s === "conflict" ? (
            <>
              <Button variant="outline" onClick={() => { onSaved(stage.fresh); onOpenChange(false); toast.info(`Loaded version ${stage.fresh.version}. Your unsaved edits were discarded.`) }}>Discard mine, load theirs</Button>
              <Button variant="destructive" onClick={() => { setBase(stage.fresh); setAck(false); setStage({ s: "review" }) }}>Review overwrite</Button>
            </>
          ) : (
            <Button onClick={() => save(base)} disabled={!canSave}>
              {stage.s === "saving" ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

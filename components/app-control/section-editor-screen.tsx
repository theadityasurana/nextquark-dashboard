"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { AlertTriangle, ArrowLeft, Braces, History, Loader2, RotateCcw, Save, Undo2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  checkSection, deepEqual, diff, getAt, pathFromProblem, pathStartsWith, sampleContext, setAt,
  type ConfigRow, type Issue, type Json, type JsonObject,
} from "@/lib/remote-config/core"
import { allFields, sectionDef } from "@/lib/remote-config/fields"
import { errorMessage, rcApi } from "./api"
import { FieldControl } from "./field-controls"
import { HelpPanel } from "./help-panel"
import { FreeSwipesPreview, JobCardPreview, OutOfSwipesPreview, SharePreview } from "./previews"
import { SaveDialog, type PendingChange } from "./save-dialog"
import { sectionHref } from "./overview-screen"

export function SectionEditor({ sectionKey }: { sectionKey: string }) {
  const def = sectionDef(sectionKey)
  const [rows, setRows] = useState<Record<string, ConfigRow> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<JsonObject | null>(null)
  const [dbProblems, setDbProblems] = useState<string[]>([])
  const [validating, setValidating] = useState(false)
  const [validateError, setValidateError] = useState<string | null>(null)
  const [tab, setTab] = useState("form")
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [change, setChange] = useState<PendingChange | null>(null)

  const row = rows?.[sectionKey]

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await rcApi.all()
      const map = Object.fromEntries(data.map(r => [r.key, r]))
      setRows(map)
      setDraft(map[sectionKey]?.value ?? null)
      setDbProblems([])
    } catch (err) {
      setLoadError(errorMessage(err))
    }
  }, [sectionKey])

  useEffect(() => { load() }, [load])

  const dirty = !!row && !!draft && !deepEqual(draft, row.value)

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [dirty])

  // Live database validation (debounced) so wrong types show up next to fields.
  useEffect(() => {
    if (!draft || !row) return
    if (!dirty) { setDbProblems([]); setValidateError(null); return }
    let cancelled = false
    const t = setTimeout(async () => {
      setValidating(true)
      try {
        const { problems } = await rcApi.validate(sectionKey, draft)
        if (!cancelled) { setDbProblems(problems); setValidateError(null) }
      } catch (err) {
        if (!cancelled) setValidateError(errorMessage(err))
      } finally {
        if (!cancelled) setValidating(false)
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(t) }
  }, [draft, row, dirty, sectionKey])

  const issues: Issue[] = useMemo(() => {
    if (!draft || !row) return []
    const local = checkSection(sectionKey, draft, row.default_value, row.value)
    const db = dbProblems.map<Issue>(p => ({ path: pathFromProblem(p) ?? [], severity: "error", message: `Database: ${p}` }))
    return [...db, ...local]
  }, [draft, row, dbProblems, sectionKey])

  const fields = def ? allFields(def) : []
  const unassigned = issues.filter(i => !fields.some(f => pathStartsWith(i.path, f.path)))
  const errorCount = issues.filter(i => i.severity === "error").length
  const changedCount = row && draft ? diff(row.value, draft).length : 0

  const rowsWithDraft = useMemo(
    () => (rows && row && draft ? { ...rows, [sectionKey]: { ...row, value: draft } } : rows ?? {}),
    [rows, row, draft, sectionKey],
  )
  const ctx = useMemo(() => sampleContext(rowsWithDraft), [rowsWithDraft])

  if (!def) {
    return <div className="text-sm text-muted-foreground">Unknown section <code className="font-mono">{sectionKey}</code>. <Link href="/settings?tab=app-control" className="text-primary underline">Back to App Control</Link></div>
  }

  if (loadError) {
    return (
      <div className="max-w-xl rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1"><p className="font-medium text-destructive">Couldn&apos;t load {def.name}</p><p className="text-xs text-muted-foreground mt-0.5">{loadError}</p></div>
        <Button size="sm" variant="outline" onClick={load}>Try again</Button>
      </div>
    )
  }

  if (!rows || !draft) {
    if (rows && !row) return <p className="text-sm text-destructive">Section {sectionKey} is missing from the database.</p>
    return <div className="flex flex-col gap-4 max-w-6xl"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 rounded-lg" /></div>
  }

  const r = row!
  const setField = (path: string[], v: Json) => setDraft(d => setAt(d ?? {}, path, v))

  const openJson = () => { setJsonText(JSON.stringify(draft, null, 2)); setJsonError(null) }
  const onJson = (text: string) => {
    setJsonText(text)
    try {
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { setJsonError("The section value must be a JSON object { … }."); return }
      setJsonError(null)
      setDraft(parsed as JsonObject)
    } catch (e) {
      setJsonError(`Invalid JSON: ${(e as Error).message}`)
    }
  }

  const preview =
    def.preview === "free_swipes" ? <FreeSwipesPreview rows={rowsWithDraft} ctx={ctx} /> :
    def.preview === "out_of_swipes" ? <OutOfSwipesPreview rows={rowsWithDraft} ctx={ctx} /> :
    def.preview === "job_card" ? <JobCardPreview rows={rowsWithDraft} /> :
    def.preview === "share" ? <SharePreview rows={rowsWithDraft} ctx={ctx} /> : null

  const leave = (e: React.MouseEvent) => { if (dirty && !window.confirm("Discard your unsaved changes?")) e.preventDefault() }

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
      <div className="flex flex-col gap-3">
        <Link href="/settings?tab=app-control" onClick={leave} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit"><ArrowLeft className="h-3 w-3" />App Control</Link>
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{def.name}</h1>
              {!deepEqual(r.value, r.default_value) && <Badge className="text-[10px] bg-primary/15 text-primary border border-primary/25">Modified</Badge>}
              {def.highImpact && <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">high impact</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{r.description ?? def.blurb}</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              <code className="font-mono">{r.key}</code> · <span className="font-mono text-foreground">v{r.version}</span> · updated {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })} by {r.updated_by ?? "unknown"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HelpPanel />
            <Button asChild variant="outline" size="sm" className="h-8"><Link href={`${sectionHref(sectionKey)}/history`} onClick={leave}><History className="h-3.5 w-3.5 mr-1.5" />History</Link></Button>
          </div>
        </div>
      </div>

      {/* Sticky save bar */}
      <div className={cn(
        "sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 glass",
        dirty ? "border-primary/40" : "border-border",
      )}>
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          {validating && <Loader2 className="h-3 w-3 animate-spin" />}
          {dirty ? <><strong className="text-foreground">{changedCount}</strong> unsaved change{changedCount === 1 ? "" : "s"}</> : "No unsaved changes"}
          {errorCount > 0 && <span className="text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" />{errorCount} problem{errorCount === 1 ? "" : "s"}</span>}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" className="h-8" disabled={deepEqual(draft, r.default_value)} onClick={() => setDraft(r.default_value)} title="Fill the form with the original defaults (not saved until you review)">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />All defaults
          </Button>
          <Button variant="outline" size="sm" className="h-8" disabled={!dirty} onClick={() => { setDraft(r.value); setDbProblems([]); if (tab === "json") openJson() }}>
            <Undo2 className="h-3.5 w-3.5 mr-1.5" />Discard
          </Button>
          <Button size="sm" className="h-8" disabled={!dirty || !!jsonError} onClick={() => setChange({ kind: "section", value: draft })}>
            <Save className="h-3.5 w-3.5 mr-1.5" />Review &amp; save
          </Button>
        </div>
      </div>

      {(unassigned.length > 0 || validateError) && (
        <ul className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
          {validateError && <li className="text-destructive">Couldn&apos;t validate with the database: {validateError}</li>}
          {unassigned.map((i, n) => (
            <li key={n} className={cn("flex gap-1.5", i.severity === "error" ? "text-destructive" : "text-warning")}>
              {i.severity === "error" ? <XCircle className="h-3.5 w-3.5 shrink-0 mt-px" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />}
              <span>{i.path.length > 0 && <code className="font-mono mr-1">{i.path.join(".")}</code>}{i.message}</span>
            </li>
          ))}
        </ul>
      )}

      <Tabs value={tab} onValueChange={t => { if (t === "json") openJson(); setTab(t) }}>
        <TabsList>
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="json"><Braces className="h-3.5 w-3.5 mr-1" />Advanced (JSON)</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="mt-4">
          <div className={cn("grid gap-5", preview && "xl:grid-cols-[minmax(0,1fr)_360px]")}>
            <div className="flex flex-col gap-4 min-w-0">
              {def.groups.map((g, gi) => (
                <Card key={gi} className="bg-card border-border">
                  {(g.title || g.note) && (
                    <CardHeader className="pb-2">
                      {g.title && <CardTitle className="text-sm font-medium">{g.title}</CardTitle>}
                      {g.note && <p className="text-xs text-muted-foreground rounded-md bg-muted/40 px-2.5 py-1.5 mt-1">{g.note}</p>}
                    </CardHeader>
                  )}
                  <CardContent className={cn("divide-y divide-border/50", !(g.title || g.note) && "pt-6")}>
                    {g.fields.map(f => (
                      <FieldControl
                        key={f.path.join(".")}
                        def={f}
                        section={sectionKey}
                        value={getAt(draft, f.path) ?? getAt(r.default_value, f.path)}
                        defaultValue={getAt(r.default_value, f.path)}
                        onChange={v => setField(f.path, v)}
                        issues={issues.filter(i => pathStartsWith(i.path, f.path))}
                        ctx={ctx}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
            {preview && <div className="xl:sticky xl:top-16 h-fit">{preview}</div>}
          </div>
        </TabsContent>

        <TabsContent value="json" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Section value (JSON)</CardTitle>
              <p className="text-xs text-muted-foreground">
                Validated the same way as the form. Fields left out use their default. Only fields listed in the form are read by the app; the forms are the primary way to edit.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Textarea
                value={jsonText}
                onChange={e => onJson(e.target.value)}
                spellCheck={false}
                rows={Math.min(36, Math.max(12, jsonText.split("\n").length + 1))}
                className={cn("font-mono text-xs leading-relaxed", jsonError && "border-destructive")}
              />
              {jsonError && <p className="text-xs text-destructive flex gap-1.5"><XCircle className="h-3.5 w-3.5 shrink-0 mt-px" />{jsonError}</p>}
              {issues.length > 0 && (
                <ul className="flex flex-col gap-1 text-xs">
                  {issues.map((i, n) => (
                    <li key={n} className={cn("flex gap-1.5", i.severity === "error" ? "text-destructive" : "text-warning")}>
                      {i.severity === "error" ? <XCircle className="h-3.5 w-3.5 shrink-0 mt-px" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />}
                      <span>{i.path.length > 0 && <code className="font-mono mr-1">{i.path.join(".")}</code>}{i.message}</span>
                    </li>
                  ))}
                </ul>
              )}
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Show default value</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-[11px]">{JSON.stringify(r.default_value, null, 2)}</pre>
              </details>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <SaveDialog
        open={!!change}
        onOpenChange={o => !o && setChange(null)}
        sectionKey={sectionKey}
        sectionName={def.name}
        loaded={r}
        change={change}
        onProblems={setDbProblems}
        onSaved={saved => {
          setRows(m => (m ? { ...m, [saved.key]: saved } : m))
          setDraft(saved.value)
          setDbProblems([])
          if (tab === "json") setJsonText(JSON.stringify(saved.value, null, 2))
        }}
      />
    </div>
  )
}

"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Trash2, AlertTriangle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  deepEqual, fillSample, findPlaceholders, formatJson, type Issue, type Json, type JsonObject, type SampleContext,
} from "@/lib/remote-config/core"
import { LEVEL_RUNGS, type ColumnDef, type FieldDef, type Option } from "@/lib/remote-config/fields"
import { FilledPreview, HighlightedText } from "./placeholder-text"

export interface FieldProps {
  def: FieldDef
  section: string
  value: Json | undefined
  defaultValue: Json | undefined
  onChange: (v: Json) => void
  issues: Issue[]
  ctx: SampleContext
}

// ─── Shell: label, help, default, modified dot, reset, issues ────────────────

export function FieldShell({ def, value, defaultValue, onChange, issues, children, section }: FieldProps & { children: ReactNode }) {
  const modified = !deepEqual(value, defaultValue)
  const id = `f-${section}-${def.path.join("-")}`
  return (
    <div id={id} className={cn("py-4 first:pt-0 last:pb-0 scroll-mt-24", issues.some(i => i.severity === "error") && "rounded-md")}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium" htmlFor={`${id}-input`}>{def.label}</label>
            {modified && <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]" title="Differs from the default" aria-label="Modified" />}
            <code className="hidden sm:inline text-[10px] text-muted-foreground/70 font-mono">{def.path.join(".")}</code>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{def.help}</p>
        </div>
        {modified && defaultValue !== undefined && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground shrink-0" onClick={() => onChange(defaultValue)} title="Reset this field to its default">
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        )}
      </div>
      {children}
      {defaultValue !== undefined && !isComplex(def) && (
        <p className="text-[11px] text-muted-foreground/80 mt-1.5 truncate" title={formatJson(defaultValue)}>
          Default: <span className="font-mono">{formatJson(defaultValue)}</span>
        </p>
      )}
      {issues.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {issues.map((iss, i) => (
            <li key={i} className={cn("flex items-start gap-1.5 text-xs", iss.severity === "error" ? "text-destructive" : "text-warning")}>
              {iss.severity === "error" ? <XCircle className="h-3.5 w-3.5 mt-px shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />}
              <span>{iss.path.length > def.path.length ? <code className="font-mono mr-1">{iss.path.slice(def.path.length).join(".")}</code> : null}{iss.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const isComplex = (def: FieldDef) => ["objectList", "planFeatures", "levels", "textList"].includes(def.kind) || (def.kind === "text" && def.multiline)

export function FieldControl(props: FieldProps) {
  const { def } = props
  let body: ReactNode
  switch (def.kind) {
    case "boolean": body = <BooleanControl {...props} />; break
    case "number": body = <NumberControl {...props} />; break
    case "text": body = <TextControl {...props} />; break
    case "textList": body = <TextListControl {...props} />; break
    case "orderedSet": body = <OrderedSetControl {...props} options={def.options} />; break
    case "hiddenSet": body = <HiddenSetControl {...props} options={def.options} />; break
    case "select": body = <SelectControl {...props} options={def.options} />; break
    case "objectList": body = <ObjectListControl {...props} columns={def.columns} itemLabel={def.itemLabel} />; break
    case "levels": body = <LevelsControl {...props} />; break
    case "planFeatures": body = <PlanFeaturesControl {...props} />; break
  }
  return <FieldShell {...props}>{body}</FieldShell>
}

// ─── Scalars ─────────────────────────────────────────────────────────────────

function BooleanControl({ value, onChange, def, section }: FieldProps) {
  const on = value === true
  return (
    <div className="flex items-center gap-2">
      <Switch id={`f-${section}-${def.path.join("-")}-input`} checked={on} onCheckedChange={c => onChange(c)} />
      <span className={cn("text-xs font-medium", on ? "text-primary" : "text-muted-foreground")}>{on ? "On" : "Off"}</span>
      {typeof value !== "boolean" && value !== undefined && <span className="text-xs text-destructive">Current value isn&apos;t true/false: {formatJson(value)}</span>}
    </div>
  )
}

function NumberControl({ value, onChange, def, defaultValue, section }: FieldProps) {
  const d = def as Extract<FieldDef, { kind: "number" }>
  const [raw, setRaw] = useState(typeof value === "number" ? String(value) : value === undefined ? "" : String(value))
  const last = useRef(value)
  useEffect(() => {
    // Sync when the value changes from outside (reset, JSON tab, quick action).
    if (!deepEqual(last.current, value)) {
      setRaw(typeof value === "number" ? String(value) : value === undefined ? "" : String(value))
      last.current = value
    }
  }, [value])
  const n = raw.trim() === "" ? NaN : Number(raw)
  const local =
    raw.trim() === "" ? "Enter a number." :
    !Number.isFinite(n) ? "Not a number." :
    d.integer && !Number.isInteger(n) ? "Use a whole number." :
    d.min !== undefined && n < d.min ? `Minimum is ${d.min}.` :
    d.max !== undefined && n > d.max ? `Maximum is ${d.max}.` : null
  return (
    <div>
      <div className="flex items-center gap-2">
        <Input
          id={`f-${section}-${def.path.join("-")}-input`}
          type="number"
          inputMode="decimal"
          className={cn("w-40 font-mono", local && "border-destructive")}
          min={d.min} max={d.max} step={d.step ?? "any"}
          placeholder={defaultValue !== undefined ? String(defaultValue) : undefined}
          value={raw}
          onChange={e => {
            setRaw(e.target.value)
            const v = Number(e.target.value)
            if (e.target.value.trim() !== "" && Number.isFinite(v)) {
              last.current = v
              onChange(v)
            }
          }}
        />
        {d.unit && <span className="text-xs text-muted-foreground">{d.unit}</span>}
        {d.min !== undefined && d.max !== undefined && <span className="text-[11px] text-muted-foreground">range {d.min}–{d.max}</span>}
      </div>
      {local && <p className="text-xs text-destructive mt-1">{local}</p>}
    </div>
  )
}

function TextControl({ value, onChange, def, section, ctx }: FieldProps) {
  const d = def as Extract<FieldDef, { kind: "text" }>
  const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value)
  const hasPlaceholders = findPlaceholders(text).length > 0
  const id = `f-${section}-${def.path.join("-")}-input`
  const showPreview = d.preview !== false && (d.multiline || hasPlaceholders)
  return (
    <div className="flex flex-col gap-2">
      {d.multiline ? (
        <Textarea id={id} rows={Math.min(8, Math.max(3, text.split("\n").length + 1))} value={text} onChange={e => onChange(e.target.value)} className="text-sm" />
      ) : (
        <Input id={id} value={text} onChange={e => onChange(e.target.value)} />
      )}
      <div className="flex items-start justify-between gap-2">
        {hasPlaceholders ? (
          <p className="text-xs text-muted-foreground min-w-0"><HighlightedText text={text} section={section} path={def.path} /></p>
        ) : <span />}
        {!d.multiline && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{Array.from(text).length} chars</span>}
      </div>
      {showPreview && <FilledPreview text={text} section={section} path={def.path} ctx={ctx} charCount={d.charCount} />}
    </div>
  )
}

function SelectControl({ value, onChange, options, def, section }: FieldProps & { options: Option[] }) {
  const v = typeof value === "string" ? value : ""
  const known = options.some(o => o.value === v)
  return (
    <div className="flex items-center gap-2">
      <Select value={v || undefined} onValueChange={x => onChange(x)}>
        <SelectTrigger id={`f-${section}-${def.path.join("-")}-input`} className="w-64"><SelectValue placeholder="Choose…" /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          {!known && v && <SelectItem value={v}>{v} (not an allowed value)</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Sortable list (native drag & drop + buttons) ────────────────────────────

function move<T>(xs: T[], from: number, to: number): T[] {
  if (to < 0 || to >= xs.length || from === to) return xs
  const out = xs.slice()
  const [it] = out.splice(from, 1)
  out.splice(to, 0, it)
  return out
}

function SortableRows<T>({ items, onReorder, render, rowClass }: {
  items: T[]
  onReorder: (next: T[]) => void
  render: (item: T, i: number) => ReactNode
  rowClass?: (item: T, i: number) => string
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li
          key={i}
          draggable
          onDragStart={e => { setDragFrom(i); e.dataTransfer.effectAllowed = "move" }}
          onDragOver={e => { e.preventDefault(); setOver(i) }}
          onDragLeave={() => setOver(o => (o === i ? null : o))}
          onDrop={e => { e.preventDefault(); if (dragFrom !== null) onReorder(move(items, dragFrom, i)); setDragFrom(null); setOver(null) }}
          onDragEnd={() => { setDragFrom(null); setOver(null) }}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-1.5 py-1",
            over === i && dragFrom !== null && dragFrom !== i && "border-primary/60 bg-primary/5",
            dragFrom === i && "opacity-50",
            rowClass?.(item, i),
          )}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground/60 cursor-grab shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">{render(item, i)}</div>
          <div className="flex shrink-0">
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => onReorder(move(items, i, i - 1))} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === items.length - 1} onClick={() => onReorder(move(items, i, i + 1))} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ─── Lists ───────────────────────────────────────────────────────────────────

function TextListControl({ value, onChange, def, section, ctx }: FieldProps) {
  const d = def as Extract<FieldDef, { kind: "textList" }>
  const items = Array.isArray(value) ? value.map(v => (typeof v === "string" ? v : JSON.stringify(v))) : []
  const set = (next: string[]) => onChange(next)
  return (
    <div className="flex flex-col gap-2">
      <SortableRows
        items={items}
        onReorder={set}
        render={(item, i) => (
          <div className="flex items-center gap-1.5">
            <span className="w-5 text-right text-[11px] font-mono text-muted-foreground">{i + 1}</span>
            <Input value={item} className="h-8" onChange={e => set(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => set(items.filter((_, j) => j !== i))} aria-label={`Remove ${d.itemLabel}`}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      />
      {items.length === 0 && <p className="text-xs text-muted-foreground">No {d.itemLabel}s.</p>}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs w-fit" onClick={() => set([...items, ""])}><Plus className="h-3 w-3 mr-1" /> Add {d.itemLabel}</Button>
        <span className="text-[11px] text-muted-foreground">{items.length} {d.itemLabel}{items.length === 1 ? "" : "s"}</span>
      </div>
      {items.some(t => findPlaceholders(t).length > 0) && (
        <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Placeholders</span>
          <ol className="mt-1 list-decimal pl-4 space-y-0.5">
            {items.map((t, i) => <li key={i}><HighlightedText text={t} section={section} path={[...def.path, String(i)]} /></li>)}
          </ol>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Filled: {items.map(t => fillSample(t, ctx, section, def.path)).join(" · ")}
          </p>
        </div>
      )}
    </div>
  )
}

function OrderedSetControl({ value, onChange, options }: FieldProps & { options: Option[] }) {
  const included = Array.isArray(value) ? (value.filter(v => typeof v === "string") as string[]) : []
  const labelOf = (v: string) => options.find(o => o.value === v)?.label ?? `${v} (not allowed)`
  const excluded = options.map(o => o.value).filter(v => !included.includes(v))
  return (
    <div className="flex flex-col gap-1.5">
      {included.length > 0 && (
        <SortableRows
          items={included}
          onReorder={next => onChange(next)}
          rowClass={v => (options.some(o => o.value === v) ? "" : "border-destructive/60")}
          render={(v, i) => (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked onCheckedChange={() => onChange(included.filter(x => x !== v))} />
              <span className="w-5 text-right text-[11px] font-mono text-muted-foreground">{i + 1}</span>
              <span className="truncate">{labelOf(v)}</span>
            </label>
          )}
        />
      )}
      {excluded.map(v => (
        <label key={v} className="flex items-center gap-2 rounded-md border border-dashed border-border/60 px-1.5 py-1.5 pl-7 text-sm text-muted-foreground cursor-pointer hover:bg-muted/30">
          <Checkbox checked={false} onCheckedChange={() => onChange([...included, v])} />
          <span className="truncate">{labelOf(v)}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider pr-2">not shown</span>
        </label>
      ))}
    </div>
  )
}

function HiddenSetControl({ value, onChange, options }: FieldProps & { options: Option[] }) {
  const hidden = Array.isArray(value) ? (value.filter(v => typeof v === "string") as string[]) : []
  const unknown = hidden.filter(h => !options.some(o => o.value === h))
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {options.map(o => {
        const on = hidden.includes(o.value)
        return (
          <label key={o.value} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm cursor-pointer", on ? "border-warning/40 bg-warning/5" : "border-border/60 hover:bg-muted/30")}>
            <Checkbox checked={on} onCheckedChange={c => onChange(c ? [...hidden, o.value] : hidden.filter(h => h !== o.value))} />
            <span className="truncate">{o.label}</span>
            {on && <span className="ml-auto text-[10px] uppercase tracking-wider text-warning">hidden</span>}
          </label>
        )
      })}
      {unknown.map(u => (
        <label key={u} className="flex items-center gap-2 rounded-md border border-destructive/60 px-2 py-1.5 text-sm text-destructive">
          <Checkbox checked onCheckedChange={() => onChange(hidden.filter(h => h !== u))} />
          {u} (not allowed)
        </label>
      ))}
    </div>
  )
}

// ─── Objects ─────────────────────────────────────────────────────────────────

function IncludedCell({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const mode = value === "yes" || value === "no" ? value : "custom"
  return (
    <div className="flex items-center gap-1.5">
      <Select value={mode} onValueChange={m => onChange(m === "custom" ? (mode === "custom" ? value : "") : m)}>
        <SelectTrigger className="h-8 w-[104px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">✓ yes</SelectItem>
          <SelectItem value="no">✕ no</SelectItem>
          <SelectItem value="custom">custom text</SelectItem>
        </SelectContent>
      </Select>
      {mode === "custom" && <Input className="h-8 w-24" value={value} placeholder="e.g. 75" onChange={e => onChange(e.target.value)} />}
    </div>
  )
}

function Cell({ col, value, onChange }: { col: ColumnDef; value: Json | undefined; onChange: (v: Json) => void }) {
  const s = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value)
  if (col.type === "select") {
    const known = col.options.some(o => o.value === s)
    return (
      <Select value={s || undefined} onValueChange={onChange}>
        <SelectTrigger className={cn("h-8", !known && "border-destructive")}><SelectValue placeholder="Choose…" /></SelectTrigger>
        <SelectContent>
          {col.options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          {!known && s && <SelectItem value={s}>{s} (not allowed)</SelectItem>}
        </SelectContent>
      </Select>
    )
  }
  if (col.type === "included") return <IncludedCell value={s} onChange={onChange} />
  return col.multiline
    ? <Textarea rows={2} className="text-sm min-h-0" value={s} onChange={e => onChange(e.target.value)} />
    : <Input className="h-8" value={s} onChange={e => onChange(e.target.value)} />
}

function ObjectList({ items, columns, itemLabel, onChange, template }: {
  items: JsonObject[]
  columns: ColumnDef[]
  itemLabel: string
  onChange: (next: JsonObject[]) => void
  template: JsonObject
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="hidden md:flex items-center gap-2 pl-7 pr-[76px] text-[10px] uppercase tracking-wider text-muted-foreground">
        {columns.map(c => <span key={c.key} className={cn(c.width ?? "flex-1")}>{c.label}</span>)}
        <span className="w-7" />
      </div>
      <SortableRows
        items={items}
        onReorder={onChange}
        render={(item, i) => (
          <div className="flex flex-col md:flex-row md:items-center gap-1.5">
            {columns.map(c => (
              <div key={c.key} className={cn("min-w-0", c.width ?? "flex-1")}>
                <span className="md:hidden text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
                <Cell col={c} value={item[c.key]} onChange={v => onChange(items.map((x, j) => (j === i ? { ...x, [c.key]: v } : x)))} />
              </div>
            ))}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 self-end md:self-auto text-muted-foreground hover:text-destructive" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${itemLabel}`}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        )}
      />
      {items.length === 0 && <p className="text-xs text-muted-foreground">No {itemLabel}s.</p>}
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs w-fit" onClick={() => onChange([...items, template])}><Plus className="h-3 w-3 mr-1" /> Add {itemLabel}</Button>
    </div>
  )
}

/** A blank item with every field of the default's items (the DB requires all of them). */
function templateFrom(def: Json | undefined, columns: ColumnDef[]): JsonObject {
  const first = Array.isArray(def) && def[0] && typeof def[0] === "object" && !Array.isArray(def[0]) ? (def[0] as JsonObject) : {}
  const out: JsonObject = {}
  for (const k of Object.keys(first)) out[k] = typeof first[k] === "string" ? "" : first[k]
  for (const c of columns) {
    if (!(c.key in out)) out[c.key] = ""
    if (c.type === "select") out[c.key] = c.options[0]?.value ?? ""
    if (c.type === "included") out[c.key] = "yes"
  }
  return out
}

const asObjects = (v: Json | undefined): JsonObject[] =>
  Array.isArray(v) ? (v.filter(x => x && typeof x === "object" && !Array.isArray(x)) as JsonObject[]) : []

function ObjectListControl({ value, onChange, defaultValue, columns, itemLabel }: FieldProps & { columns: ColumnDef[]; itemLabel: string }) {
  return <ObjectList items={asObjects(value)} columns={columns} itemLabel={itemLabel} onChange={onChange} template={templateFrom(defaultValue, columns)} />
}

const FEATURE_COLUMNS: ColumnDef[] = [
  { key: "label", label: "Label", type: "text" },
  { key: "included", label: "Included", type: "included", width: "w-[220px]" },
]

function PlanFeaturesControl({ value, onChange, defaultValue }: FieldProps) {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {}
  const defObj = defaultValue && typeof defaultValue === "object" && !Array.isArray(defaultValue) ? (defaultValue as JsonObject) : {}
  const plans = Array.from(new Set([...Object.keys(defObj), ...Object.keys(obj)]))
  const [tab, setTab] = useState(plans.includes("starter") ? "starter" : plans[0])
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        {plans.map(p => (
          <TabsTrigger key={p} value={p} className="text-xs">
            {p}{!deepEqual(obj[p], defObj[p]) && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />}
          </TabsTrigger>
        ))}
      </TabsList>
      {plans.map(p => (
        <TabsContent key={p} value={p} className="mt-3">
          {p === "free" && <p className="text-xs text-muted-foreground mb-2">The free entry isn&apos;t shown on the paywall today.</p>}
          <ObjectList
            items={asObjects(obj[p] ?? defObj[p])}
            columns={FEATURE_COLUMNS}
            itemLabel="row"
            template={templateFrom(defObj[p], FEATURE_COLUMNS)}
            onChange={next => onChange({ ...obj, [p]: next })}
          />
          {!deepEqual(obj[p], defObj[p]) && defObj[p] !== undefined && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 mt-2 text-xs text-muted-foreground" onClick={() => onChange({ ...obj, [p]: defObj[p] })}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reset {p} rows
            </Button>
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}

function LevelsControl({ value, onChange, defaultValue }: FieldProps) {
  const obj = value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {}
  const defObj = defaultValue && typeof defaultValue === "object" && !Array.isArray(defaultValue) ? (defaultValue as JsonObject) : {}
  const keys = Array.from(new Set([...Object.keys(defObj), ...Object.keys(obj)]))
  const rung = (n: Json | undefined) => (typeof n === "number" ? String(n) : undefined)
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-muted-foreground">Rungs: {LEVEL_RUNGS.join(" · ")}</p>
      {keys.map(k => {
        const range = Array.isArray(obj[k]) ? (obj[k] as Json[]) : Array.isArray(defObj[k]) ? (defObj[k] as Json[]) : [0, 0]
        const bad = !(typeof range[0] === "number" && typeof range[1] === "number" && range[0] <= range[1])
        const setRange = (i: 0 | 1, v: string) => {
          const next = [range[0], range[1]] as Json[]
          next[i] = Number(v)
          onChange({ ...obj, [k]: next })
        }
        return (
          <div key={k} className={cn("flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5", bad ? "border-destructive/60" : "border-border/60")}>
            <code className="w-28 text-xs font-mono">{k}</code>
            <span className="text-xs text-muted-foreground">from</span>
            <RungSelect value={rung(range[0])} onChange={v => setRange(0, v)} />
            <span className="text-xs text-muted-foreground">to</span>
            <RungSelect value={rung(range[1])} onChange={v => setRange(1, v)} />
            {!deepEqual(obj[k], defObj[k]) && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Differs from the default" />}
            {defObj[k] !== undefined && <span className="ml-auto text-[11px] text-muted-foreground">default {formatJson(defObj[k])}</span>}
          </div>
        )
      })}
    </div>
  )
}

function RungSelect({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>{LEVEL_RUNGS.map((l, i) => <SelectItem key={i} value={String(i)}>{l}</SelectItem>)}</SelectContent>
    </Select>
  )
}

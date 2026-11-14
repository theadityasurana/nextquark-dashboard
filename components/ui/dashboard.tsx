"use client"

// Shared building blocks for dashboard pages: one page header, one stat card,
// one panel, so every screen has the same hierarchy and rhythm.

import * as React from "react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"

export function PageHeader({ title, description, actions, eyebrow }: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  eyebrow?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2 text-xs font-medium text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("panel overflow-hidden", className)} {...props}>
      {children}
    </div>
  )
}

export function PanelHeader({ title, description, actions, icon: Icon, className }: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  icon?: React.ElementType
  className?: string
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-border px-5 py-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Sparkline({ data, dataKey = "count", color = "var(--chart-1)", id }: {
  data: any[]
  dataKey?: string
  color?: string
  id: string
}) {
  if (!data?.length) return null
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#spark-${id})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

type Tone = "positive" | "negative" | "neutral"

export function Delta({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
      tone === "positive" && "bg-success/12 text-success",
      tone === "negative" && "bg-destructive/12 text-destructive",
      tone === "neutral" && "bg-muted text-muted-foreground",
    )}>
      {children}
    </span>
  )
}

export function StatCard({ label, value, icon: Icon, delta, deltaTone, footnote, children, live }: {
  label: string
  value: React.ReactNode
  icon?: React.ElementType
  delta?: React.ReactNode
  deltaTone?: Tone
  footnote?: React.ReactNode
  children?: React.ReactNode
  live?: boolean
}) {
  return (
    <div className="panel relative flex flex-col overflow-hidden p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          {live && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
          )}
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/70" />}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="num text-[28px] font-semibold leading-none text-foreground">
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {delta && <Delta tone={deltaTone}>{delta}</Delta>}
      </div>
      {footnote && <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function Meter({ value, max = 100, tone = "primary", className }: {
  value: number
  max?: number
  tone?: "primary" | "success" | "warning" | "destructive"
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const color = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", destructive: "bg-destructive" }[tone]
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function TableHead({ columns, className }: { columns: { label: string; className?: string }[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 border-b border-border bg-muted/40 px-5 py-2", className)}>
      {columns.map((c) => (
        <span key={c.label} className={cn("eyebrow", c.className)}>{c.label}</span>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description }: { icon?: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {Icon && (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted/50">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-xs text-xs text-muted-foreground">{description}</p>}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-lg border border-border bg-muted/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded-md px-2.5 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-card text-foreground shadow-[var(--shadow-card)] dark:bg-accent"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  const initials = (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"
  // Stable hue per name so the same person always gets the same colour.
  let h = 0
  for (const ch of name || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const hues = [272, 250, 300, 195, 165, 20, 340, 230]
  return (
    <div
      className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold text-white", className)}
      style={{ background: `oklch(0.56 0.14 ${hues[h % hues.length]})` }}
    >
      {initials}
    </div>
  )
}

// ── Section, toolbar and chart helpers ─────────────────────────────────────

export function Section({ title, description, actions, children, className }: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>{children}</div>
}

export function SearchField({ value, onChange, placeholder = "Search…", className }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <svg className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm text-foreground shadow-[var(--shadow-card)] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 dark:bg-input/20"
      />
    </div>
  )
}

export function KpiGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const c = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[cols]
  return <div className={cn("grid grid-cols-2 gap-3 sm:gap-4", c)}>{children}</div>
}

/** Compact KPI tile for dense strips (6+ metrics). */
export function MiniStat({ label, value, dot, hint, active, onClick }: {
  label: string
  value: React.ReactNode
  dot?: string
  hint?: React.ReactNode
  active?: boolean
  onClick?: () => void
}) {
  const Comp = onClick ? "button" : "div"
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "panel flex flex-col gap-2 px-4 py-3.5 text-left",
        onClick && "transition-colors hover:border-input",
        active && "ring-2 ring-primary/50",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
        {label}
      </span>
      <span className="num text-2xl font-semibold leading-none text-foreground">
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </Comp>
  )
}

export const chartTooltip = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: 12,
  color: "var(--popover-foreground)",
  padding: "8px 12px",
  boxShadow: "var(--shadow-pop)",
}
export const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" }
export const gridStroke = "var(--border)"
/** Ordered palette for categorical series; one hue family, then supporting hues. */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-5)", "var(--chart-4)"]

export function Pagination({ page, totalPages, onPage, summary }: {
  page: number
  totalPages: number
  onPage: (p: number) => void
  summary?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
      <span className="text-xs text-muted-foreground tabular-nums">{summary}</span>
      <div className="flex items-center gap-1.5">
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-8 rounded-lg border border-input bg-card px-3 text-xs font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
        >
          Previous
        </button>
        <span className="px-2 text-xs tabular-nums text-muted-foreground">{page} / {Math.max(1, totalPages)}</span>
        <button
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="h-8 rounded-lg border border-input bg-card px-3 text-xs font-medium shadow-[var(--shadow-card)] transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}

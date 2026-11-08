"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BookOpen, Check, Copy, MessageCircle, RefreshCw, Sparkles, Phone, Search } from "lucide-react"
import { ReplyPlaybook } from "@/components/outreach-playbook"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { countWords, MAX_WORDS } from "@/lib/outreach"
import type { OutreachRow } from "@/lib/outreach-data"

type Filter = "todo" | "done" | "all"
const RANGES = [7, 14, 30] as const

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`
}

function CopyButton({ text, label, title }: { text: string; label?: string; title?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      title={title ?? `Copy ${label ?? ""}`.trim()}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        } catch {}
      }}
      className="inline-flex items-center gap-1 rounded border border-border/60 px-1.5 h-6 text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-colors"
    >
      {done ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {label}
    </button>
  )
}

function OutreachCard({ row, onToggle, onSave, onRegenerate, onPlaybook, busy }: {
  row: OutreachRow
  onPlaybook: () => void
  onToggle: (contacted: boolean) => void
  onSave: (message: string) => void
  onRegenerate: () => void
  busy: boolean
}) {
  const [draft, setDraft] = useState(row.message ?? "")
  useEffect(() => setDraft(row.message ?? ""), [row.message])
  const words = countWords(draft)
  const waUrl = row.phone?.countryCode ? `https://wa.me/${row.phone.waDigits}?text=${encodeURIComponent(draft)}` : null

  return (
    <div className={`rounded-lg border p-4 transition-colors ${row.contacted ? "border-emerald-500/30 bg-emerald-500/[0.03]" : "border-border/60 bg-card"}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={row.contacted}
          onCheckedChange={(v) => onToggle(v === true)}
          className="mt-1"
          aria-label={row.contacted ? "Mark as not contacted" : "Mark as contacted"}
        />
        <div className="flex-1 min-w-0 space-y-3">
          {/* Who */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{row.name}</span>
            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium tabular-nums">
              {row.jobsApplied} applied
            </span>
            {row.jobsSwiped > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">{row.jobsSwiped} swiped</span>
            )}
            {row.isPremium && <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[11px]">Premium</span>}
            <span className="text-[11px] text-muted-foreground">joined {daysAgo(row.signedUpAt)}</span>
            {row.contacted && row.contactedAt && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400">✓ contacted {daysAgo(row.contactedAt)}</span>
            )}
          </div>
          {(row.headline || row.roles.length > 0 || row.location || row.companies.length > 0) && (
            <p className="text-xs text-muted-foreground truncate">
              {[row.headline, row.roles.slice(0, 2).join(", "), row.location, row.companies.length ? `applied: ${row.companies.slice(0, 3).join(", ")}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {/* Phone */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            {row.phone ? (
              <>
                <span className="font-mono tabular-nums">{row.phone.display}</span>
                {row.phone.assumedCountryCode && <span className="text-[11px] text-amber-600 dark:text-amber-400">(+91 assumed)</span>}
                <CopyButton text={`${row.phone.countryCode}${row.phone.national}`} label="Full" title="Copy number with country code" />
                {row.phone.countryCode && <CopyButton text={row.phone.countryCode} label={row.phone.countryCode} title="Copy country code" />}
                <CopyButton text={row.phone.national} label="Number" title="Copy number without country code" />
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No phone on file{row.email ? ` · ${row.email}` : ""}</span>
            )}
          </div>

          {/* Message */}
          {row.message === null && !draft ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              No message drafted yet.
              <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={onRegenerate} disabled={busy}>
                <Sparkles className={`h-3 w-3 ${busy ? "animate-pulse" : ""}`} /> Draft
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => draft !== (row.message ?? "") && onSave(draft)}
                rows={4}
                className="text-sm leading-relaxed resize-y"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] tabular-nums ${words > MAX_WORDS ? "text-destructive" : "text-muted-foreground"}`}>
                  {words}/{MAX_WORDS} words
                </span>
                <div className="flex-1" />
                <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={onPlaybook} title="They replied? Open the reply playbook with their name filled in">
                  <BookOpen className="h-3 w-3" /> They replied
                </Button>
                <CopyButton text={draft} label="Copy message" />
                <Button size="sm" variant="outline" className="h-6 text-[11px] gap-1" onClick={onRegenerate} disabled={busy}>
                  <Sparkles className={`h-3 w-3 ${busy ? "animate-pulse" : ""}`} /> Regenerate
                </Button>
                {waUrl && (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2 h-6 text-[11px] font-medium"
                  >
                    <MessageCircle className="h-3 w-3" /> Open WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function OutreachScreen() {
  const [days, setDays] = useState<number>(7)
  const [rows, setRows] = useState<OutreachRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("todo")
  const [query, setQuery] = useState("")
  const [drafting, setDrafting] = useState<Set<string>>(new Set())
  const [draftingAll, setDraftingAll] = useState(false)
  const [view, setView] = useState<"contacts" | "playbook">("contacts")
  const [playbookName, setPlaybookName] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/outreach?days=${days}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || res.statusText)
      setRows(json.rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => { void load() }, [load])

  const patch = async (userId: string, fields: { contacted?: boolean; message?: string }) => {
    setRows((prev) => prev.map((r) => r.userId === userId
      ? { ...r, ...fields, contactedAt: fields.contacted === undefined ? r.contactedAt : fields.contacted ? new Date().toISOString() : null }
      : r))
    const res = await fetch("/api/outreach", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...fields }) })
    if (!res.ok) void load()
  }

  const draft = async (userIds?: string[]) => {
    if (userIds) setDrafting((s) => new Set([...s, ...userIds]))
    else setDraftingAll(true)
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, userIds, regenerate: !!userIds }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || res.statusText)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drafting failed")
    } finally {
      if (userIds) setDrafting((s) => { const n = new Set(s); userIds.forEach((id) => n.delete(id)); return n })
      else setDraftingAll(false)
    }
  }

  const stats = useMemo(() => ({
    total: rows.length,
    done: rows.filter((r) => r.contacted).length,
    withPhone: rows.filter((r) => r.phone).length,
    applied: rows.filter((r) => r.jobsApplied > 0).length,
    missing: rows.filter((r) => !r.message).length,
  }), [rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) =>
      (filter === "all" || (filter === "done" ? r.contacted : !r.contacted)) &&
      (!q || r.name.toLowerCase().includes(q) || (r.phone?.display ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")) || (r.email ?? "").toLowerCase().includes(q))
    )
  }, [rows, filter, query])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gradient">Sales &amp; Outreach</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Personal WhatsApp notes from you to recent signups: intro, their activity, a feedback ask, and what they&apos;re looking for.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 h-7 text-xs transition-colors ${days === d ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {d}d
              </button>
            ))}
          </div>
          {stats.missing > 0 && (
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => draft()} disabled={draftingAll}>
              <Sparkles className={`h-3 w-3 ${draftingAll ? "animate-pulse" : ""}`} />
              {draftingAll ? "Drafting…" : `Draft ${stats.missing} missing`}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-border/60" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center rounded-md border border-border/60 overflow-hidden self-start">
        {([["contacts", "Contacts"], ["playbook", "Reply playbook"]] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 h-8 text-xs font-medium transition-colors ${view === v ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "playbook" ? (
        <ReplyPlaybook key={playbookName} initialName={playbookName} />
      ) : (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Signups", value: stats.total },
          { label: "To contact", value: stats.total - stats.done },
          { label: "Contacted", value: stats.done },
          { label: "Have a phone", value: stats.withPhone },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {stats.total > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(stats.done / stats.total) * 100}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground">{stats.done} of {stats.total} contacted · {stats.applied} have applied to at least one job</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
          {([["todo", `To contact (${stats.total - stats.done})`], ["done", `Contacted (${stats.done})`], ["all", `All (${stats.total})`]] as const).map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 h-8 text-xs transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, email" className="h-8 pl-7 text-xs" />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          {filter === "todo" && stats.total > 0 ? "Everyone in this range has been contacted." : "No signups in this range."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((row) => (
            <OutreachCard
              key={row.userId}
              row={row}
              busy={draftingAll || drafting.has(row.userId)}
              onToggle={(contacted) => patch(row.userId, { contacted })}
              onSave={(message) => patch(row.userId, { message })}
              onRegenerate={() => draft([row.userId])}
              onPlaybook={() => { setPlaybookName(row.firstName); setView("playbook"); window.scrollTo({ top: 0 }) }}
            />
          ))}
        </div>
      )}
      </>
      )}
    </div>
  )
}

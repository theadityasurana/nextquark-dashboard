"use client"

import { useEffect, useState } from "react"
import { BookOpen, Check, Copy, MessageCircle, RefreshCw, Sparkles, Phone, Users, Mail, Linkedin, ExternalLink, Repeat } from "lucide-react"
import useSWR from "swr"
import { PageHeader, StatCard, KpiGrid, Meter, Segmented, Toolbar, SearchField, EmptyState, Pagination } from "@/components/ui/dashboard"
import { ReplyPlaybook } from "@/components/outreach-playbook"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { countWords, MAX_WORDS } from "@/lib/outreach"
import type { OutreachRow } from "@/lib/outreach-data"

type Filter = "todo" | "done" | "all" | "returning"
const RANGES = [7, 14, 30, 0] as const

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
      className="inline-flex items-center gap-1 rounded border border-border px-1.5 h-6 text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-colors"
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
    <div className={`panel min-w-0 p-4 sm:p-5 transition-colors ${row.contacted ? "opacity-70" : ""}`}>
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
            <span className="min-w-0 break-words text-[15px] font-semibold tracking-tight">{row.name}</span>
            <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium tabular-nums">
              {row.jobsApplied} applied
            </span>
            {row.jobsSwiped > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">{row.jobsSwiped} swiped</span>
            )}
            {row.isPremium && <span className="rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 text-[11px]">Premium</span>}
            <span className="text-[11px] text-muted-foreground">joined {daysAgo(row.signedUpAt)}</span>
            {row.returnedAfterDays >= 1 && (
              <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success" title={row.lastSignInAt ? `Last sign-in ${new Date(row.lastSignInAt).toLocaleString()}` : undefined}>
                Came back after {row.returnedAfterDays}d · last seen {daysAgo(row.lastSignInAt ?? row.lastActive ?? row.signedUpAt)}
              </span>
            )}
            {row.contacted && row.contactedAt && (
              <span className="text-[11px] text-success" title={new Date(row.contactedAt).toLocaleString()}>✓ marked contacted {daysAgo(row.contactedAt)}</span>
            )}
          </div>
          {(row.headline || row.roles.length > 0 || row.location || row.companies.length > 0) && (
            <p className="text-xs text-muted-foreground truncate">
              {[row.headline, row.roles.slice(0, 2).join(", "), row.location, row.companies.length ? `applied: ${row.companies.slice(0, 3).join(", ")}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {/* Contact channels */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {row.phone ? (
                <>
                  <span className="font-mono tabular-nums">{row.phone.display}</span>
                  {row.phone.assumedCountryCode && <span className="text-[11px] text-warning">(+91 assumed)</span>}
                  <CopyButton text={`${row.phone.countryCode}${row.phone.national}`} label="Full" title="Copy number with country code" />
                  {row.phone.countryCode && <CopyButton text={row.phone.countryCode} label={row.phone.countryCode} title="Copy country code" />}
                  <CopyButton text={row.phone.national} label="Number" title="Copy number without country code" />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No phone on file</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {row.email ? (
                <>
                  <a href={`mailto:${row.email}`} className="break-all text-[13px] hover:underline">{row.email}</a>
                  <CopyButton text={row.email} label="Copy" title="Copy email address" />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No email</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Linkedin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {row.linkedinUrl ? (
                <>
                  <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-[13px] text-primary hover:underline">
                    {row.linkedinUrl.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <CopyButton text={row.linkedinUrl} label="Copy" title="Copy LinkedIn URL" />
                </>
              ) : (
                <span className="text-xs text-muted-foreground">No LinkedIn on profile</span>
              )}
            </div>
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

type OutreachStats = { total: number; done: number; withPhone: number; withLinkedin: number; applied: number; missing: number; returning: number; returningUncontacted: number }
type OutreachResp = { rows: OutreachRow[]; total: number; stats: OutreachStats }
const PER_PAGE = 20
const outreachFetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || res.statusText)
  return json
}

export function OutreachScreen() {
  const [days, setDays] = useState<number>(7)
  const [filter, setFilter] = useState<Filter>("todo")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [actionError, setActionError] = useState<string | null>(null)
  const [drafting, setDrafting] = useState<Set<string>>(new Set())
  const [draftingAll, setDraftingAll] = useState(false)
  const [view, setView] = useState<"contacts" | "playbook">("contacts")
  const [playbookName, setPlaybookName] = useState("")

  useEffect(() => { const t = setTimeout(() => setDebouncedQuery(query.trim()), 300); return () => clearTimeout(t) }, [query])
  useEffect(() => { setPage(1) }, [days, filter, debouncedQuery])

  const key = `/api/outreach?days=${days || 99999}&filter=${filter}&page=${page}&limit=${PER_PAGE}${debouncedQuery ? `&q=${encodeURIComponent(debouncedQuery)}` : ""}`
  const { data, error: loadError, isLoading, isValidating, mutate } = useSWR<OutreachResp>(key, outreachFetcher, { keepPreviousData: true, revalidateOnFocus: false })
  const rows = data?.rows ?? []
  const stats: OutreachStats = data?.stats ?? { total: 0, done: 0, withPhone: 0, withLinkedin: 0, applied: 0, missing: 0, returning: 0, returningUncontacted: 0 }
  const error = actionError ?? (loadError ? (loadError as Error).message : null)
  const load = () => mutate()

  const patch = async (userId: string, fields: { contacted?: boolean; message?: string }) => {
    // Optimistic: update this page now, then let the server confirm.
    void mutate((prev) => prev ? {
      ...prev,
      rows: prev.rows.map((r) => r.userId === userId
        ? { ...r, ...fields, contactedAt: fields.contacted === undefined ? r.contactedAt : fields.contacted ? new Date().toISOString() : null }
        : r),
    } : prev, { revalidate: false })
    const res = await fetch("/api/outreach", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, ...fields }) })
    if (!res.ok) setActionError("Couldn't save that change — refreshed from the server.")
    void mutate()
  }

  const draft = async (userIds?: string[]) => {
    if (userIds) setDrafting((s) => new Set([...s, ...userIds]))
    else setDraftingAll(true)
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: days || 99999, userIds, regenerate: !!userIds }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || res.statusText)
      await mutate()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Drafting failed")
    } finally {
      if (userIds) setDrafting((s) => { const n = new Set(s); userIds.forEach((id) => n.delete(id)); return n })
      else setDraftingAll(false)
    }
  }

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Sales & outreach"
        description="Personal notes to recent signups over WhatsApp, email or LinkedIn — plus the returning users worth a direct pitch."
        actions={
          <>
            <Segmented value={String(days)} onChange={(v) => setDays(Number(v))} options={RANGES.map((d) => ({ value: String(d), label: d === 0 ? "All" : `${d}d` }))} />
            {stats.missing > 0 && (
              <Button size="sm" className="gap-1.5" onClick={() => draft()} disabled={draftingAll}>
                <Sparkles className={`h-3.5 w-3.5 ${draftingAll ? "animate-pulse" : ""}`} />
                {draftingAll ? "Drafting…" : `Draft ${stats.missing} missing`}
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-2" onClick={() => load()} disabled={isValidating}>
              <RefreshCw className={`h-3.5 w-3.5 ${isValidating ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </>
        }
      />

      <div className="self-start">
        <Segmented value={view} onChange={setView} options={[{ value: "contacts", label: "Contacts" }, { value: "playbook", label: "Reply playbook" }]} />
      </div>

      {view === "playbook" ? (
        <ReplyPlaybook key={playbookName} initialName={playbookName} />
      ) : (
      <>
      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="panel h-32 shimmer" />)}
        </div>
      ) : (
        <KpiGrid>
          <StatCard label="Signups" value={stats.total} icon={Users} footnote={`${stats.applied} applied to a job`} />
          <StatCard label="To contact" value={stats.total - stats.done} icon={MessageCircle} footnote={`${stats.withPhone} phone · ${stats.withLinkedin} LinkedIn`} />
          <StatCard label="Marked contacted" value={stats.done} icon={Check}
            footnote={`${stats.total ? Math.round((stats.done / stats.total) * 100) : 0}% of signups in range`}>
            <Meter value={stats.done} max={Math.max(1, stats.total)} tone="success" />
          </StatCard>
          <StatCard label="Returning users" value={stats.returning} icon={Repeat}
            delta={stats.returningUncontacted > 0 ? `${stats.returningUncontacted} not contacted` : undefined} deltaTone="positive"
            footnote="signed in again a day or more after joining" />
        </KpiGrid>
      )}

      <Toolbar>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todo", label: `To contact · ${stats.total - stats.done}` },
            { value: "returning", label: `Returning · ${stats.returning}` },
            { value: "done", label: `Contacted · ${stats.done}` },
            { value: "all", label: `All · ${stats.total}` },
          ]}
        />
        <SearchField value={query} onChange={setQuery} placeholder="Search name, phone, email…" />
      </Toolbar>

      {filter === "returning" && (
        <p className="-mt-4 text-xs text-muted-foreground">
          Ranked by interest: applications, swipes, how long after signup they came back, and how recently they were active.
          Supabase doesn&apos;t record a sign-in count, so &quot;returning&quot; means their latest sign-in or activity was at least a day after they joined.
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {isLoading && !data ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="panel h-48 shimmer" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel">
          <EmptyState icon={MessageCircle}
            title={filter === "todo" && stats.total > 0 ? "Everyone in this range is marked contacted" : filter === "returning" ? "No returning users in this range" : "No signups in this range"} />
        </div>
      ) : (
        <div className={`flex flex-col gap-3 transition-opacity ${isValidating ? "opacity-60" : ""}`}>
          {rows.map((row) => (
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

      {total > PER_PAGE && (
        <div className="panel">
          <Pagination page={page} totalPages={totalPages} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }) }}
            summary={`${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, total)} of ${total.toLocaleString()}`} />
        </div>
      )}
      </>
      )}
    </div>
  )
}

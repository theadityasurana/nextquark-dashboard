"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { StatusBadge } from "@/components/status-badge"
import { ApplicationDetails } from "@/components/application-details"
import { LiveApplicationQueue, ApplicationStats } from "@/lib/types/live-queue.types"
// ApplicationStats is used by ApplicationDetails prop type
import { useLogs } from "@/lib/logs-context"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { stepLabel } from "@/lib/run-timeline"
import { runCost, runSeconds, formatCost, KERNEL_RATES } from "@/lib/run-cost"
import { useUIPreferences } from "@/hooks/use-ui-preferences"
import { PortalHealthStrip } from "@/components/portal-health-strip"
import { PerformanceDialog } from "@/components/performance-dialog"
import { PageHeader, Panel, PanelHeader, MiniStat, Toolbar, SearchField, TableHead, EmptyState, Pagination, Avatar, TableSkeleton } from "@/components/ui/dashboard"
import useSWR from "swr"

type QueueResponse = {
  rows: LiveApplicationQueue[]
  total: number
  counts: Record<string, number>
  freePending: number
  eligiblePending: number
}
const queueFetcher = async (url: string) => {
  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return body
}
import {
  Search, Eye, Trash2, Loader, KeyRound, ShieldAlert, ExternalLink,
  Receipt, XCircle, CircleSlash, TriangleAlert, Info, Crown, Play,
  BarChart3,
} from "lucide-react"

const ATS_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "Lever",           pattern: /lever\.co/ },
  { name: "Greenhouse",      pattern: /greenhouse\.io/ },
  { name: "Ashby",           pattern: /ashbyhq\.com/ },
  { name: "Workday",         pattern: /myworkdayjobs\.com|workday\.com/ },
  { name: "SmartRecruiters", pattern: /smartrecruiters\.com/ },
  { name: "BambooHR",        pattern: /bamboohr\.com/ },
  { name: "Jobvite",         pattern: /jobvite\.com/ },
  { name: "iCIMS",           pattern: /icims\.com/ },
  { name: "LinkedIn",        pattern: /linkedin\.com\/jobs/ },
]

function detectAts(url: string): string | null {
  if (!url) return null
  return ATS_PATTERNS.find(p => p.pattern.test(url))?.name ?? null
}

// Small inline tooltip helper so every control gets an (i) icon
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3 w-3 text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

// Kept in memory only, for the moment between leaving this tab and coming back.

export function QueueScreen() {
  const [selectedApp, setSelectedApp] = useState<LiveApplicationQueue | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [confirmDeleteAllPending, setConfirmDeleteAllPending] = useState(false)
  // Per-application streaming state — replaces the single isStreaming boolean
  // that was disabling Start for every app whenever any one was running.
  const [streamingApps, setStreamingApps] = useState<Set<string>>(new Set())
  // Active runs tray — minimizable floating cards at the bottom
  const [activeTray, setActiveTray] = useState<Array<{ app: LiveApplicationQueue; minimized: boolean }>>([])
  const { prefs, setPrefs, loaded: prefsLoaded } = useUIPreferences()
  const autoStart = prefs.autoStart
  const premiumOnly = prefs.premiumOnly
  const maxConcurrent = prefs.maxConcurrent ?? 5
  const setAutoStart = (val: boolean) => setPrefs({ autoStart: val })
  const setPremiumOnly = (val: boolean) => setPrefs({ premiumOnly: val })
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({})
  const [savingOtp, setSavingOtp] = useState<Record<string, boolean>>({})
  const [resolvingCaptcha, setResolvingCaptcha] = useState<Record<string, boolean>>({})
  const [realtimeConnected, setRealtimeConnected] = useState(true)
  const [queuePage, setQueuePage] = useState(1)
  const [performanceOpen, setPerformanceOpen] = useState(false)
  const [selectedCandidateFilter, setSelectedCandidateFilter] = useState<string>("")

  const QUEUE_PER_PAGE = 25

  // AbortControllers keyed by app id — cancelled when an app is deleted mid-run
  const abortControllersRef = useRef<Record<string, AbortController>>({})

  const { addLog } = useLogs()

  // ─── OTP / CAPTCHA handlers ───────────────────────────────────────────────

  const handleSaveOtp = async (appId: string, otp: string) => {
    setSavingOtp(prev => ({ ...prev, [appId]: true }))
    try {
      await fetch('/api/live-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId, verification_otp: otp }),
      })
      addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "info", agentId: appId, message: `OTP saved. Backend will pick it up and resume automation automatically.`, applicationId: appId })
      setOtpInputs(prev => { const n = { ...prev }; delete n[appId]; return n })
    } catch (error) {
      addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "error", agentId: appId, message: `Failed to save OTP: ${error instanceof Error ? error.message : 'Unknown error'}`, applicationId: appId })
    } finally {
      setSavingOtp(prev => ({ ...prev, [appId]: false }))
    }
  }

  const handleResolveCaptcha = async (appId: string) => {
    setResolvingCaptcha(prev => ({ ...prev, [appId]: true }))
    try {
      await fetch('/api/live-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId, status: 'processing' }),
      })
      setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: 'processing' as const } : a))
      addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "info", agentId: appId, message: `CAPTCHA marked as solved. A live run resumes; a finished one goes back to the queue.`, applicationId: appId })
    } catch (error) {
      addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "error", agentId: appId, message: `Failed to mark CAPTCHA as solved: ${error instanceof Error ? error.message : 'Unknown error'}`, applicationId: appId })
    } finally {
      setResolvingCaptcha(prev => ({ ...prev, [appId]: false }))
    }
  }

  // ─── Manual start ─────────────────────────────────────────────────────────
  // Automatic dispatch lives in the server-side worker, so it does not depend on
  // this page being open. This only streams progress for a run started by hand.

  const startApplication = useCallback(async (app: LiveApplicationQueue) => {
    setActiveTray(prev => prev.some(t => t.app.id === app.id) ? prev : [...prev, { app, minimized: false }])
    setStreamingApps(prev => { const n = new Set(prev); n.add(app.id); return n })
    addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "info", agentId: app.id, message: `Starting task for ${app.first_name} ${app.last_name} - ${app.job_title} at ${app.company_name}`, applicationId: app.id })

    const abortController = new AbortController()
    abortControllersRef.current[app.id] = abortController

    try {
      const response = await fetch("/api/auto-apply-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: app.id, stream: true }),
        signal: abortController.signal,
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || `Server error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No response stream')

      // The row's status arrives through realtime; only the log lines come from here.
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.log) addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: data.status === "error" ? "error" : "info", agentId: app.id, message: data.log, applicationId: app.id })
            if (data.outcome) {
              addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: data.outcome === "completed" ? "info" : "warn", agentId: app.id, message: `Finished: ${data.outcome}${data.error ? ` (${data.error})` : ""}`, applicationId: app.id })
              setActiveTray(prev => prev.map(t => t.app.id === app.id ? { ...t, app: { ...t.app, status: data.outcome === "completed" ? 'completed' as const : 'failed' as const } } : t))
            }
          } catch { /* partial chunk */ }
        }
      }
    } catch (error) {
      addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "error", agentId: app.id, message: `Task error: ${error instanceof Error ? error.message : 'Unknown error'}`, applicationId: app.id })
    } finally {
      delete abortControllersRef.current[app.id]
      setStreamingApps(prev => { const n = new Set(prev); n.delete(app.id); return n })
    }
  }, [addLog])

  // ─── Data loading ─────────────────────────────────────────────────────────
  // One page, filtered and counted in Postgres. Realtime only tells us that
  // something changed; we then refetch this page (coalesced), never the table.

  const [debouncedSearch, setDebouncedSearch] = useState("")
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300); return () => clearTimeout(t) }, [searchQuery])
  const queueKey = `/api/live-queue?page=${queuePage}&limit=${QUEUE_PER_PAGE}&tab=${activeTab}` +
    (debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : "") +
    (selectedCandidateFilter ? `&user=${selectedCandidateFilter}` : "") +
    (premiumOnly ? "&premiumOnly=1" : "")
  const { data: queueResp, isLoading: queueLoading, isValidating: queueValidating, mutate: mutateQueue } = useSWR<QueueResponse>(queueKey, queueFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })
  const { data: candidates = [], mutate: mutateCandidates } = useSWR<{ user_id: string; name: string; pending: number }[]>(
    "/api/live-queue?candidates=1", queueFetcher, { revalidateOnFocus: false })
  const applications: LiveApplicationQueue[] = queueResp?.rows ?? []
  const counts = queueResp?.counts ?? {}
  const refreshQueue = useCallback(() => { void mutateQueue(); void mutateCandidates() }, [mutateQueue, mutateCandidates])
  const setApplications = (fn: (prev: LiveApplicationQueue[]) => LiveApplicationQueue[]) => {
    void mutateQueue(prev => prev ? { ...prev, rows: fn(prev.rows) } : prev, { revalidate: false })
  }

  useEffect(() => {
    const { createClient } = require('@/lib/supabase/client')
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) return
      timer = setTimeout(() => { timer = null; if (!document.hidden) refreshQueue() }, 1_500)
    }

    const channel = supabase
      .channel('live-queue-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_application_queue' }, schedule)
      .subscribe((status: string) => {
        setRealtimeConnected(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') schedule()
      })

    // Safety net for dropped events: one page, only while the tab is visible.
    const resync = setInterval(() => { if (!document.hidden) refreshQueue() }, 60_000)

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
      clearInterval(resync)
    }
  }, [refreshQueue])

  const handleDeleteAllPending = async () => {
    try {
      await fetch('/api/live-queue', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deleteAllPending: true }) })
      setConfirmDeleteAllPending(false)
      refreshQueue()
    } catch (err) { console.error('Failed to delete all pending:', err) }
  }

  const [completingFreePending, setCompletingFreePending] = useState(false)
  const handleCompleteFreePending = async () => {
    setCompletingFreePending(true)
    try {
      await fetch('/api/live-queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completeFreePending: true }) })
      refreshQueue()
    } catch (err) { console.error('Failed to complete free pending:', err) }
    finally { setCompletingFreePending(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      // Fix #15: abort any in-flight SSE stream before deleting
      if (abortControllersRef.current[id]) {
        abortControllersRef.current[id].abort()
        delete abortControllersRef.current[id]
      }
      await fetch('/api/live-queue', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setApplications(prev => prev.filter(app => app.id !== id))
      setDeleteId(null)
      refreshQueue()
    } catch (err) { console.error('Failed to delete:', err) }
  }

  // ─── Derived state (Fix #14: stats derived from applications, no separate state) ──

  const n = (k: string) => counts[k] ?? 0
  const liveCount = Math.max(n('live'), streamingApps.size)
  const stats = {
    totalApps: n('all'),
    successful: n('completed'),
    failed: n('failed'),
    inProgress: n('live'),
  }
  // Eligible pending apps (respecting Premium only) not already streaming here.
  const waitingForSlot = Math.max(0, (queueResp?.eligiblePending ?? 0) - streamingApps.size)

  const totalFilteredApps = queueResp?.total ?? 0
  const totalQueuePages = Math.max(1, Math.ceil(totalFilteredApps / QUEUE_PER_PAGE))
  const safePage = Math.min(queuePage, totalQueuePages)
  const paginatedApps = applications

  // ─── Render ───────────────────────────────────────────────────────────────

  const freePending = queueResp?.freePending ?? 0
  const statFilters: { label: string; value: number; dot?: string; tab: string }[] = [
    { label: 'Total',      value: n('all'), tab: 'all' },
    { label: 'Premium',    value: n('premium'),  dot: 'bg-warning',          tab: 'premium' },
    { label: 'Pending',    value: n('pending'),      dot: 'bg-muted-foreground', tab: 'pending' },
    { label: 'Processing', value: n('processing'),   dot: 'bg-chart-2',          tab: 'processing' },
    { label: 'Completed',  value: n('completed'),    dot: 'bg-success',          tab: 'completed' },
    { label: 'Failed',     value: n('failed'),       dot: 'bg-destructive',      tab: 'failed' },
    { label: 'Blocked',    value: n('blocked'),      dot: 'bg-orange-500',       tab: 'blocked' },
  ]
  const tabs: { value: string; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: n('all') },
    { value: 'live', label: 'Live', count: liveCount },
    { value: 'premium', label: 'Premium', count: n('premium') },
    { value: 'pending', label: 'Pending', count: n('pending') },
    { value: 'processing', label: 'Processing', count: n('processing') },
    { value: 'completed', label: 'Completed', count: n('completed') },
    { value: 'failed', label: 'Failed', count: n('failed') },
    { value: 'awaiting_otp', label: 'OTP', count: n('awaiting_otp') },
    { value: 'awaiting_captcha', label: 'CAPTCHA', count: n('awaiting_captcha') },
    { value: 'blocked', label: 'Blocked', count: n('blocked') },
  ]
  const selectTab = (v: string) => { setActiveTab(v); setQueuePage(1); setSelectedCandidateFilter("") }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col gap-8">

      <PageHeader
        eyebrow={
          realtimeConnected ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" /></span>
              Live · streaming updates
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-warning"><span className="h-1.5 w-1.5 rounded-full bg-warning" />Reconnecting…</span>
          )
        }
        title="Live queue"
        description="Every application Iris is submitting, in real time."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPerformanceOpen(true)}>
              <BarChart3 className="h-3.5 w-3.5" /> Performance
            </Button>
            {freePending > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" disabled={completingFreePending} onClick={handleCompleteFreePending}>
                {completingFreePending ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Crown className="h-3.5 w-3.5 text-warning" />}
                Complete free pending · {freePending}
              </Button>
            )}
            {n('pending') > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmDeleteAllPending(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete pending · {n('pending')}
              </Button>
            )}
          </>
        }
      />

      {/* Status counters double as filters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {statFilters.map(s => (
          <MiniStat key={s.label} label={s.label} value={s.value} dot={s.dot} active={activeTab === s.tab} onClick={() => selectTab(s.tab)} />
        ))}
      </div>

      {/* Dispatch controls */}
      <Panel>
        <PanelHeader
          title="Dispatch"
          description="How the background worker picks up pending applications"
          actions={
            (autoStart || premiumOnly) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
                {autoStart && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
                {autoStart && premiumOnly ? "Auto · premium only" : autoStart ? "Auto-starting all" : "Premium filter on"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">Manual</span>
            )
          }
        />
        <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
          <label className="flex cursor-pointer items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-medium"><Play className="h-3.5 w-3.5 text-muted-foreground" />Auto start <InfoTip text="When ON, the server-side worker starts every eligible pending application within seconds, up to the concurrency limit. The dashboard does not need to be open." /></p>
              <p className="mt-1 text-xs text-muted-foreground">
                {autoStart ? (waitingForSlot > 0 ? `${waitingForSlot} waiting for a free slot` : "Worker starts new applications automatically") : "Applications wait until started manually"}
              </p>
            </div>
            <Switch checked={autoStart} onCheckedChange={setAutoStart} className="data-[state=checked]:bg-success" />
          </label>
          <label className="flex cursor-pointer items-start justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[13px] font-medium"><Crown className="h-3.5 w-3.5 text-warning" />Premium only <InfoTip text="When ON, Auto Start and Start All only process premium-flagged applications. Non-premium apps stay in the queue untouched." /></p>
              <p className="mt-1 text-xs text-muted-foreground">{premiumOnly ? "Only premium users are dispatched" : "All users are dispatched"}</p>
            </div>
            <Switch checked={premiumOnly} onCheckedChange={setPremiumOnly} className="data-[state=checked]:bg-warning" />
          </label>
          <div className="flex flex-col gap-3 px-5 py-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[13px] font-medium">Concurrency <InfoTip text="The maximum number of applications running at once, across the worker and manual starts." /></p>
              <span className="num rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-semibold">{maxConcurrent}</span>
            </div>
            <input
              type="range" min={1} max={50} value={maxConcurrent}
              onChange={(e) => setPrefs({ maxConcurrent: Number(e.target.value) })}
              className="w-full cursor-pointer accent-primary"
            />
            <p className="text-xs text-muted-foreground">{n('processing')} of {maxConcurrent} slots in use</p>
          </div>
        </div>
      </Panel>

      <PortalHealthStrip />

      {/* Applications table */}
      <Panel>
        <div className="border-b border-border">
          <div className="-mb-px flex gap-1 overflow-x-auto px-3 scrollbar-hide">
            {tabs.map(t => (
              <button
                key={t.value}
                onClick={() => selectTab(t.value)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-3 text-[13px] font-medium transition-colors ${activeTab === t.value ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {t.value === 'live' && liveCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-chart-2" />}
                {t.value === 'premium' && <Crown className="h-3 w-3 text-warning" />}
                {t.label}
                <span className={`rounded-full px-1.5 text-[10.5px] tabular-nums ${activeTab === t.value ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        <Toolbar className="border-b border-border px-5 py-3">
          <SearchField value={searchQuery} onChange={(v) => { setSearchQuery(v); setQueuePage(1) }} placeholder="Search name, company or job…" className="sm:w-80" />
          <Select
            value={selectedCandidateFilter}
            onValueChange={(v) => { setSelectedCandidateFilter(v === "__all__" ? "" : v); setQueuePage(1) }}
          >
            <SelectTrigger size="sm" className="h-9 w-full text-xs sm:w-56">
              <SelectValue placeholder="All candidates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">All candidates</SelectItem>
              {candidates.map(c => (
                <SelectItem key={c.user_id} value={c.user_id} className="text-xs">
                  {c.name || "Unnamed"} ({c.pending} pending)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground tabular-nums sm:ml-auto">{totalFilteredApps.toLocaleString()} results</span>
        </Toolbar>

        <TableHead className="hidden lg:flex" columns={[
          { label: "Candidate", className: "w-52 shrink-0" },
          { label: "Company · Role", className: "flex-1 min-w-0" },
          { label: "Portal", className: "w-28 shrink-0" },
          { label: "Submitted", className: "w-32 shrink-0" },
          { label: "Cost", className: "w-14 shrink-0 text-right" },
          { label: "Status", className: "w-32 shrink-0 text-right" },
          { label: "", className: "w-14 shrink-0" },
        ]} />

        {queueLoading && !queueResp ? (
          <TableSkeleton rows={10} />
        ) : paginatedApps.length === 0 ? (
          <EmptyState icon={Search} title="No applications here" description="Nothing matches this filter right now." />
        ) : (
        <div className={`divide-y divide-border transition-opacity ${queueValidating && queueResp ? "opacity-60" : ""}`}>
        {paginatedApps.map((app) => {
          const fullName = `${app.first_name} ${app.last_name}`
          const createdDate = new Date(app.created_at).toISOString().slice(0, 16).replace('T', ' ')
          const atsName = app.portal_name ?? detectAts(app.job_url)
          const chip = "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium"
          const signals: React.ReactNode[] = []
          if (app.knockout_blocked) signals.push(<span key="ko" className={`${chip} border-destructive/25 bg-destructive/10 text-destructive`} title={app.knockout_reason || app.last_error || ''}><CircleSlash className="h-2.5 w-2.5 shrink-0" /><span className="truncate">Won&apos;t apply{(app.knockout_reason || app.last_error) ? ` · ${app.knockout_reason || app.last_error}` : ''}</span></span>)
          if (!app.knockout_blocked && (app.coverage_blocking_missing?.length ?? 0) > 0) signals.push(<span key="miss" className={`${chip} border-orange-500/25 bg-orange-500/10 text-orange-500`}><TriangleAlert className="h-2.5 w-2.5 shrink-0" /><span className="truncate">Missing: {app.coverage_blocking_missing!.join(", ")}</span></span>)
          if (!app.knockout_blocked && app.coverage_percent != null && app.coverage_percent < 100 && !(app.coverage_blocking_missing?.length)) signals.push(<span key="cov" className={`${chip} border-border text-muted-foreground`}>{app.coverage_percent}% fillable</span>)
          if (app.confirmation_id) signals.push(<span key="conf" className={`${chip} border-success/25 bg-success/10 font-mono text-success`}><Receipt className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{app.confirmation_id}</span></span>)
          if (app.failed_step && app.status === 'failed') signals.push(<span key="fs" className={`${chip} border-destructive/25 text-destructive`}><XCircle className="h-2.5 w-2.5 shrink-0" />Failed at {stepLabel(app.failed_step)}</span>)
          if (app.attempt_count > 0) signals.push(<span key="att" className={`${chip} ${app.status === 'failed' ? 'border-destructive/25 text-destructive' : 'border-orange-500/25 text-orange-500'}`}>Attempt {app.attempt_count}/{app.max_attempts || 2}{app.last_error && app.status === 'pending' ? ' · retrying' : ''}</span>)
          return (
            <div key={app.id} className="group cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setSelectedApp(app)}>
              <div className="flex flex-col gap-2 px-5 py-3 lg:flex-row lg:items-center lg:gap-4">
                <div className="flex w-full min-w-0 items-center gap-2.5 lg:w-52 lg:shrink-0">
                  <Avatar name={fullName} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 truncate text-[13px] font-medium">
                      <span className="truncate">{fullName}</span>
                      {app.is_premium && (
                        <Tooltip>
                          <TooltipTrigger asChild><Crown className="h-3 w-3 shrink-0 text-warning" /></TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Premium user</TooltipContent>
                        </Tooltip>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{app.phone}</p>
                  </div>
                  <div className="ml-auto lg:hidden"><StatusBadge status={app.status} /></div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{app.company_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{app.job_title}</p>
                  {signals.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{signals}</div>}
                </div>
                <span className="truncate text-xs text-muted-foreground lg:w-28 lg:shrink-0">{atsName ?? '—'}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground lg:w-32 lg:shrink-0">{createdDate}</span>
                <span
                  className="text-xs tabular-nums text-muted-foreground lg:w-14 lg:shrink-0 lg:text-right"
                  title={runCost(app) !== null ? `Kernel browser time: ${runSeconds(app)!.toFixed(1)}s at $${KERNEL_RATES.headful}/sec` : undefined}
                >
                  {runCost(app) !== null ? formatCost(runCost(app)) : '—'}
                </span>
                <div className="hidden w-32 shrink-0 justify-end lg:flex"><StatusBadge status={app.status} /></div>
                <div className="flex shrink-0 items-center justify-end gap-0.5 lg:w-14 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setSelectedApp(app) }} aria-label="View">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(app.id) }} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

                {/* OTP input */}
                {app.status === 'awaiting_otp' && (
                  <div className="mx-5 mb-3 rounded-lg border border-orange-500/25 bg-orange-500/5 p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <Input placeholder="Enter OTP…" className="h-8 text-xs flex-1 min-w-0 sm:max-w-xs" value={otpInputs[app.id] || ''} onChange={(e) => setOtpInputs(prev => ({ ...prev, [app.id]: e.target.value }))} />
                      <Button size="sm" className="h-8 text-xs gap-1 shrink-0" disabled={!otpInputs[app.id] || savingOtp[app.id]} onClick={() => handleSaveOtp(app.id, otpInputs[app.id])}>
                        {savingOtp[app.id] ? <Loader className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                        {savingOtp[app.id] ? 'Saving…' : 'Submit OTP'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">The worker picks it up and resumes automatically.</p>
                  </div>
                )}

                {/* CAPTCHA */}
                {app.status === 'awaiting_captcha' && (
                  <div className="mx-5 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3" onClick={(e) => e.stopPropagation()}>
                    <p className="text-[11px] text-muted-foreground flex-1 min-w-48">Browser session is live. Solve the CAPTCHA, then mark it solved.</p>
                    {app.live_url && (
                      <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => window.open(app.live_url!, '_blank')}>
                        <ExternalLink className="h-3 w-3" /> Open browser
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" className="h-8 text-xs gap-1" disabled={resolvingCaptcha[app.id]} onClick={() => handleResolveCaptcha(app.id)}>
                      {resolvingCaptcha[app.id] ? <Loader className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
                      {resolvingCaptcha[app.id] ? 'Resuming…' : 'Mark as solved'}
                    </Button>
                  </div>
                )}
            </div>
          )
        })}
        </div>
        )}

        {totalQueuePages > 1 && (
          <Pagination
            page={safePage}
            totalPages={totalQueuePages}
            onPage={setQueuePage}
            summary={`${((safePage - 1) * QUEUE_PER_PAGE) + 1}–${Math.min(safePage * QUEUE_PER_PAGE, totalFilteredApps)} of ${totalFilteredApps.toLocaleString()}`}
          />
        )}
      </Panel>

      <PerformanceDialog open={performanceOpen} onOpenChange={setPerformanceOpen} />

      {/* Delete all pending confirmation */}
      <AlertDialog open={confirmDeleteAllPending} onOpenChange={setConfirmDeleteAllPending}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete All Pending</AlertDialogTitle>
          <AlertDialogDescription>This will permanently delete all {n('pending')} pending applications. This action cannot be undone.</AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAllPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete All</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Application</AlertDialogTitle>
          <AlertDialogDescription>Are you sure you want to delete this application? This action cannot be undone.</AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Application detail modal — does NOT close on outside click when app is running */}
      <Dialog
        open={!!selectedApp}
        onOpenChange={(open) => { if (!open) setSelectedApp(null) }}
      >
        <DialogContent
          className="w-[95vw] max-w-4xl p-0 max-h-[90dvh] overflow-y-auto overflow-x-hidden"
          // Prevent accidental dismissal while streaming
          onInteractOutside={(e) => {
            if (selectedApp && streamingApps.has(selectedApp.id)) e.preventDefault()
          }}
        >
          <DialogTitle className="sr-only">Application Details</DialogTitle>
          {selectedApp && (
            <ApplicationDetails
              application={selectedApp}
              stats={stats}
              onStartApplication={() => {
                startApplication(selectedApp)
                setSelectedApp(null) // close modal — app moves to tray
              }}
              isStreaming={streamingApps.has(selectedApp.id)}
              recordingUrl={null}
              canStart={liveCount < maxConcurrent && !streamingApps.has(selectedApp.id)}
              onStatusChange={(id, status) => {
                setApplications(prev => prev.map(a => a.id === id ? { ...a, status } : a))
                setSelectedApp(prev => prev?.id === id ? { ...prev, status } : prev)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {/* ── Active Runs Tray ──
           Floating cards at the bottom of the screen, one per running application.
           Clicking outside the modal no longer kills the run — it moves here.
           Each card shows live status and can be minimized or dismissed once done. */}
      {activeTray.length > 0 && (
        <div className="fixed bottom-4 right-2 sm:right-4 z-50 flex flex-col-reverse gap-2 items-end" style={{ maxWidth: 'calc(100vw - 1rem)' }}>
          {activeTray.map(({ app, minimized }) => {
            const isRunning = streamingApps.has(app.id)
            const isDone = app.status === 'completed' || app.status === 'failed'
            return (
              <div
                key={app.id}
                className={`rounded-lg border shadow-lg bg-card transition-all duration-200 ${
                  app.status === 'completed' ? 'border-green-500/40' :
                  app.status === 'failed'    ? 'border-destructive/40' :
                  isRunning                  ? 'border-blue-500/40' :
                  'border-border'
                }`}
                style={{ width: minimized ? 'min(14rem, calc(100vw - 1rem))' : 'min(18rem, calc(100vw - 1rem))' }}
              >
                {/* Tray card header — always visible */}
                <div
                  className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
                  onClick={() => setActiveTray(prev => prev.map(t => t.app.id === app.id ? { ...t, minimized: !t.minimized } : t))}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isRunning && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                      </span>
                    )}
                    {app.status === 'completed' && <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />}
                    {app.status === 'failed'    && <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />}
                    {!isRunning && !isDone       && <span className="h-2 w-2 rounded-full bg-muted-foreground shrink-0" />}
                    <span className="text-xs font-medium truncate">{app.first_name} {app.last_name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{minimized ? '▲' : '▼'}</span>
                    {isDone && (
                      <button
                        className="ml-1 text-muted-foreground hover:text-foreground"
                        onClick={(e) => { e.stopPropagation(); setActiveTray(prev => prev.filter(t => t.app.id !== app.id)) }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded body */}
                {!minimized && (
                  <div className="px-3 pb-3 flex flex-col gap-1.5 border-t border-border pt-2">
                    <p className="text-[11px] text-muted-foreground truncate">{app.job_title} · {app.company_name}</p>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={app.status} />
                      {isRunning && <span className="text-[10px] text-blue-500">Running…</span>}
                      {app.status === 'completed' && <span className="text-[10px] text-green-500">Done ✓</span>}
                      {app.status === 'failed'    && <span className="text-[10px] text-destructive">Failed</span>}
                    </div>
                    {/* Fix #11: slot bar uses maxConcurrent state (not ref) so it re-renders on slider change */}
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {Array.from({ length: maxConcurrent }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full ${
                            i < streamingApps.size ? 'bg-blue-500' : 'bg-muted'
                          }`}
                        />
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-1">{streamingApps.size}/{maxConcurrent}</span>
                    </div>
                    {waitingForSlot > streamingApps.size && (
                      <span className="text-[10px] text-blue-500">{waitingForSlot - streamingApps.size} more waiting…</span>
                    )}
                    {/* Open detail button */}
                    <button
                      className="text-[10px] text-primary hover:underline text-left mt-0.5"
                      onClick={() => {
                        setSelectedApp(applications.find(a => a.id === app.id) ?? app)
                      }}
                    >
                      View details →
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
    </TooltipProvider>
  )
}

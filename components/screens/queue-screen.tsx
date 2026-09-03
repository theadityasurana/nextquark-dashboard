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
import {
  Search, Eye, Trash2, Loader, KeyRound, ShieldAlert, ExternalLink,
  Receipt, XCircle, CircleSlash, TriangleAlert, Info, Crown, Play
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

export function QueueScreen() {
  const [selectedApp, setSelectedApp] = useState<LiveApplicationQueue | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [applications, setApplications] = useState<LiveApplicationQueue[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isStartingAll, setIsStartingAll] = useState(false)
  // Local queue backlog depth — shown in the tray so the operator knows how many are waiting
  const [localQueueDepth, setLocalQueueDepth] = useState(0)
  // Per-application streaming state — replaces the single isStreaming boolean
  // that was disabling Start for every app whenever any one was running.
  const [streamingApps, setStreamingApps] = useState<Set<string>>(new Set())
  // Active runs tray — minimizable floating cards at the bottom
  const [activeTray, setActiveTray] = useState<Array<{ app: LiveApplicationQueue; minimized: boolean }>>([])
  const { prefs, setPrefs, loaded: prefsLoaded } = useUIPreferences()
  const autoStart = prefs.autoStart
  const premiumOnly = prefs.premiumOnly
  const maxConcurrent = prefs.maxConcurrent ?? 3
  const setAutoStart = (val: boolean) => setPrefs({ autoStart: val })
  const setPremiumOnly = (val: boolean) => setPrefs({ premiumOnly: val })
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({})
  const [savingOtp, setSavingOtp] = useState<Record<string, boolean>>({})
  const [resolvingCaptcha, setResolvingCaptcha] = useState<Record<string, boolean>>({})
  const [realtimeConnected, setRealtimeConnected] = useState(true)
  const [queuePage, setQueuePage] = useState(1)
  const [selectedCandidateFilter, setSelectedCandidateFilter] = useState<string>("")

  const QUEUE_PER_PAGE = 10

  // Refs that survive re-renders without causing them
  const autoStartTimersRef = useRef<Record<string, NodeJS.Timeout>>({})
  const processingCountRef = useRef(0)
  const pendingQueueRef = useRef<LiveApplicationQueue[]>([])
  // AbortControllers keyed by app id — cancelled when an app is deleted mid-run
  const abortControllersRef = useRef<Record<string, AbortController>>({})
  // Keep refs to latest values so callbacks always see current values
  const premiumOnlyRef = useRef(premiumOnly)
  useEffect(() => { premiumOnlyRef.current = premiumOnly }, [premiumOnly])
  const maxConcurrentRef = useRef(maxConcurrent)
  useEffect(() => { maxConcurrentRef.current = maxConcurrent }, [maxConcurrent])
  // streamingAppsRef mirrors streamingApps state so enqueueOrStart can read it synchronously
  const streamingAppsRef = useRef<Set<string>>(new Set())

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
      addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "info", agentId: appId, message: `CAPTCHA marked as solved. Automation will resume automatically.`, applicationId: appId })
    } catch (error) {
      addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "error", agentId: appId, message: `Failed to mark CAPTCHA as solved: ${error instanceof Error ? error.message : 'Unknown error'}`, applicationId: appId })
    } finally {
      setResolvingCaptcha(prev => ({ ...prev, [appId]: false }))
    }
  }

  // ─── Application dispatch ─────────────────────────────────────────────────

  // A ref so processNext always calls the latest startApplication without
  // creating a circular useCallback dependency.
  const startApplicationRef = useRef<(app: LiveApplicationQueue) => Promise<void>>(async () => {})

  // processNext drains the local pending queue into available slots
  const processNext = useCallback(() => {
    while (processingCountRef.current < maxConcurrentRef.current && pendingQueueRef.current.length > 0) {
      const next = pendingQueueRef.current.shift()!
      startApplicationRef.current(next)
    }
    setLocalQueueDepth(pendingQueueRef.current.length)
  }, [])

  const startApplication = useCallback(async (app: LiveApplicationQueue) => {
    processingCountRef.current++

    // Add to the active tray so the user can see progress without keeping the modal open
    setActiveTray(prev => {
      if (prev.some(t => t.app.id === app.id)) return prev
      return [...prev, { app, minimized: false }]
    })
    setStreamingApps(prev => { const n = new Set(prev); n.add(app.id); streamingAppsRef.current = n; return n })

    await fetch('/api/live-queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: app.id, status: 'processing' }),
    })
    setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'processing' as const } : a))
    addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "info", agentId: app.id, message: `Starting task for ${app.first_name} ${app.last_name} - ${app.job_title} at ${app.company_name} (${processingCountRef.current}/${maxConcurrentRef.current} slots used)`, applicationId: app.id })

    const abortController = new AbortController()
    abortControllersRef.current[app.id] = abortController

    try {
      const response = await fetch("/api/auto-apply-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: app.id, stream: true }),
        signal: abortController.signal,
      })
      if (!response.ok) throw new Error(`Server error: ${response.status}`)

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error('No response stream')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split("\n")
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.log) addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: data.status === "error" ? "error" : "info", agentId: app.id, message: data.log, applicationId: app.id })
            if (data.status === "retrying") {
              addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "warn", agentId: app.id, message: `Attempt ${data.attempt}/${data.maxAttempts} failed: ${data.error}. Will retry automatically...`, applicationId: app.id })
              setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'pending' as const } : a))
            }
            if (data.status === "error") {
              addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "error", agentId: app.id, message: `All ${data.maxAttempts || 1} attempts failed: ${data.error || "An error occurred"}`, applicationId: app.id })
              setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'failed' as const } : a))
              setActiveTray(prev => prev.map(t => t.app.id === app.id ? { ...t, app: { ...t.app, status: 'failed' as const } } : t))
            }
            if (data.status === "awaiting_captcha") {
              addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "warn", agentId: app.id, message: `CAPTCHA detected. Browser session is live — waiting for human to solve it.${data.liveUrl ? ` Live URL: ${data.liveUrl}` : ''}`, applicationId: app.id })
              setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'awaiting_captcha' as const, live_url: data.liveUrl || a.live_url } : a))
            }
            if (data.status === "awaiting_otp") {
              addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "warn", agentId: app.id, message: `OTP verification required. Automation paused. Waiting for OTP...`, applicationId: app.id })
              setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'awaiting_otp' as const } : a))
            }
            if (data.status === "completed" && data.success !== false) {
              addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "info", agentId: app.id, message: `Application submitted & confirmed after ${data.steps ?? 0} steps`, applicationId: app.id })
              const updatePayload: any = { id: app.id, status: 'completed' }
              if (data.recordingUrl) updatePayload.recording_url = data.recordingUrl
              await fetch('/api/live-queue', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) })
              setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'completed' as const, recording_url: data.recordingUrl || a.recording_url } : a))
              setActiveTray(prev => prev.map(t => t.app.id === app.id ? { ...t, app: { ...t.app, status: 'completed' as const } } : t))
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (error) {
      addLog({ id: `log-${Date.now()}-${Math.random()}`, timestamp: new Date().toLocaleTimeString(), level: "error", agentId: app.id, message: `Task error: ${error instanceof Error ? error.message : 'Unknown error'}`, applicationId: app.id })
    } finally {
      processingCountRef.current--
      delete abortControllersRef.current[app.id]
      setStreamingApps(prev => { const n = new Set(prev); n.delete(app.id); streamingAppsRef.current = n; return n })
      processNext()
    }
  }, [addLog, processNext])

  // Keep the ref pointing at the latest startApplication so processNext
  // always dispatches the current version.
  useEffect(() => { startApplicationRef.current = startApplication }, [startApplication])

  // enqueueOrStart: respects the concurrency cap; guards against double-dispatch
  const enqueueOrStart = useCallback((app: LiveApplicationQueue) => {
    // Never start or queue an app that is already streaming
    if (streamingAppsRef.current.has(app.id)) return
    if (processingCountRef.current < maxConcurrentRef.current) {
      startApplicationRef.current(app)
    } else {
      if (!pendingQueueRef.current.some(a => a.id === app.id)) {
        pendingQueueRef.current.push(app)
        setLocalQueueDepth(pendingQueueRef.current.length)
      }
    }
  }, [])

  // ─── Realtime data loading ────────────────────────────────────────────────

  useEffect(() => {
    const loadApplications = async () => {
      try {
        const response = await fetch('/api/live-queue')
        const data = await response.json()
        if (Array.isArray(data)) {
          setApplications(data)
          // Fix #2: sync processingCountRef with actual DB state on every load
          // so a page refresh doesn't reset the counter to 0 while apps are running
          const activeCount = data.filter((a: LiveApplicationQueue) =>
            a.status === 'processing'
          ).length
          processingCountRef.current = Math.max(processingCountRef.current, activeCount)
          // Fix #8: clamp page to valid range after data changes
          setQueuePage(p => {
            const maxPage = Math.max(1, Math.ceil(data.length / QUEUE_PER_PAGE))
            return p > maxPage ? maxPage : p
          })
        }
      } catch (err) {
        console.error('Failed to fetch applications:', err)
      }
    }

    loadApplications()

    const { createClient } = require('@/lib/supabase/client')
    const supabase = createClient()
    let fallbackInterval: NodeJS.Timeout | null = null

    const channel = supabase
      .channel('live-queue-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_application_queue' }, loadApplications)
      .on('system', {}, (status: any) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true)
          if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null }
        } else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) {
          setRealtimeConnected(false)
          if (!fallbackInterval) fallbackInterval = setInterval(loadApplications, 10000)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (fallbackInterval) clearInterval(fallbackInterval)
    }
  }, [])

  // ─── Auto-start logic ─────────────────────────────────────────────────────
  // FIX: The old implementation had a broken cleanup — the effect's return function
  // ran on every `applications` change, clearing timers that were just set.
  // Now timers are managed imperatively: we only ADD timers for newly-seen pending
  // apps and only REMOVE timers for apps that are no longer pending.
  // premiumOnlyRef is used inside the timer callback so it always reads the
  // current value at fire-time, not the value when the timer was created.

  useEffect(() => {
    if (!prefsLoaded) return
    if (!autoStart) {
      // Turn off: cancel every pending timer immediately
      Object.values(autoStartTimersRef.current).forEach(clearTimeout)
      autoStartTimersRef.current = {}
      return
    }

    // Which apps should auto-start right now?
    const eligible = applications.filter(a =>
      a.status === 'pending' && (!premiumOnlyRef.current || a.is_premium)
    )
    const eligibleIds = new Set(eligible.map(a => a.id))

    // Cancel timers for apps that are no longer eligible (status changed, or
    // premiumOnly was toggled and this app is not premium)
    for (const id of Object.keys(autoStartTimersRef.current)) {
      if (!eligibleIds.has(id)) {
        clearTimeout(autoStartTimersRef.current[id])
        delete autoStartTimersRef.current[id]
      }
    }

    // Set timers for newly eligible apps that don't have one yet
    for (const app of eligible) {
      // Fix #5: skip apps already streaming — a retry status flip must not re-dispatch
      if (streamingAppsRef.current.has(app.id)) continue
      if (!autoStartTimersRef.current[app.id]) {
        autoStartTimersRef.current[app.id] = setTimeout(() => {
          delete autoStartTimersRef.current[app.id]
          // Re-check premiumOnly at fire time using the ref
          if (!premiumOnlyRef.current || app.is_premium) {
            enqueueOrStart(app)
          }
        }, 2000)
      }
    }
    // No cleanup return here — we manage timers imperatively above
  }, [autoStart, applications, enqueueOrStart, prefsLoaded])

  // ─── Client-side processing timeout ─────────────────────────────────────
  // If a job has been in 'processing' for >15 min and the cron hasn't fired yet,
  // mark it completed locally and patch Supabase so the UI stays accurate.
  useEffect(() => {
    const TIMEOUT_MS = 15 * 60 * 1000
    const interval = setInterval(() => {
      const cutoff = new Date(Date.now() - TIMEOUT_MS).toISOString()
      const timedOut = applications.filter(
        a => a.status === 'processing' && a.started_at && new Date(a.started_at).toISOString() < cutoff
      )
      if (timedOut.length === 0) return
      timedOut.forEach(async (app) => {
        await fetch('/api/live-queue', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: app.id,
            status: 'completed',
          }),
        })
      })
      setApplications(prev => prev.map(a =>
        timedOut.some(t => t.id === a.id)
          ? { ...a, status: 'completed' as const }
          : a
      ))
    }, 60_000)
    return () => clearInterval(interval)
  }, [applications])

  // When premiumOnly changes while autoStart is ON, cancel timers for
  // non-premium apps that were already scheduled
  useEffect(() => {
    if (!autoStart) return
    if (premiumOnly) {
      // Cancel any pending timers for non-premium apps
      for (const [id, timer] of Object.entries(autoStartTimersRef.current)) {
        const app = applications.find(a => a.id === id)
        if (app && !app.is_premium) {
          clearTimeout(timer)
          delete autoStartTimersRef.current[id]
        }
      }
    }
  }, [premiumOnly, autoStart, applications])

  const handleDelete = async (id: string) => {
    try {
      // Fix #15: abort any in-flight SSE stream before deleting
      if (abortControllersRef.current[id]) {
        abortControllersRef.current[id].abort()
        delete abortControllersRef.current[id]
      }
      // Remove from local pending queue too
      pendingQueueRef.current = pendingQueueRef.current.filter(a => a.id !== id)
      setLocalQueueDepth(pendingQueueRef.current.length)
      await fetch('/api/live-queue', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setApplications(applications.filter(app => app.id !== id))
      setDeleteId(null)
    } catch (err) { console.error('Failed to delete:', err) }
  }

  // ─── Derived state (Fix #14: stats derived from applications, no separate state) ──

  const pending        = applications.filter(a => a.status === "pending")
  const processing     = applications.filter(a => a.status === "processing")
  const completed      = applications.filter(a => a.status === "completed")
  const failed         = applications.filter(a => a.status === "failed")
  const awaitingOtp    = applications.filter(a => a.status === "awaiting_otp")
  const awaitingCaptcha = applications.filter(a => a.status === "awaiting_captcha")
  const blocked        = applications.filter(a => a.status === "blocked")
  const premiumApps    = applications.filter(a => a.is_premium)
  const stats = {
    totalApps: applications.length,
    successful: completed.length,
    failed: failed.length,
    inProgress: processing.length + awaitingOtp.length + awaitingCaptcha.length,
  }

  // Pending apps that are eligible given the current premiumOnly toggle
  const eligiblePending = premiumOnly ? pending.filter(a => a.is_premium) : pending

  const filteredApps = applications.filter(app => {
    if (activeTab === "premium") { if (!app.is_premium) return false }
    else if (activeTab !== "all" && app.status !== activeTab) return false
    if (selectedCandidateFilter && app.user_id !== selectedCandidateFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const fullName = `${app.first_name} ${app.last_name}`.toLowerCase()
      return fullName.includes(q) || app.company_name.toLowerCase().includes(q) || app.job_title.toLowerCase().includes(q)
    }
    return true
  })

  const totalFilteredApps = filteredApps.length
  const totalQueuePages = Math.max(1, Math.ceil(totalFilteredApps / QUEUE_PER_PAGE))
  // Fix #8: clamp page in render too, in case state update hasn't flushed yet
  const safePage = Math.min(queuePage, totalQueuePages)
  const paginatedApps = filteredApps.slice((safePage - 1) * QUEUE_PER_PAGE, safePage * QUEUE_PER_PAGE)

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col gap-4 sm:gap-6">

      {/* ── Header + stats row ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gradient">Live Application Queue</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Real-time monitoring of all application submissions</p>
        </div>
        {/* Live connection indicator top-right */}
        <div className="flex items-center gap-1.5 shrink-0">
          {realtimeConnected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <span className="text-xs text-muted-foreground">Live</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
              </span>
              <span className="text-xs text-yellow-500">Reconnecting...</span>
            </>
          )}
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {[
          { label: 'Total',      value: applications.length,    color: 'text-foreground' },
          { label: 'Premium',    value: premiumApps.length,     color: 'text-yellow-500' },
          { label: 'Pending',    value: pending.length,         color: 'text-muted-foreground' },
          { label: 'Processing', value: processing.length,      color: 'text-blue-500' },
          { label: 'Done',       value: completed.length,       color: 'text-green-500' },
          { label: 'Failed',     value: failed.length,          color: 'text-destructive' },
          { label: 'Blocked',    value: blocked.length,         color: 'text-orange-500' },
        ].map(s => (
          <div key={s.label} className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-2.5 px-2">
            <span className={`text-lg font-bold leading-none ${s.color}`}>{s.value}</span>
            <span className="text-[10px] text-muted-foreground mt-1">{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Dispatch controls (toggles + start) ── */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dispatch Controls</p>
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-2">

          {/* Premium Only */}
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-accent/30 px-2.5 py-2">
            <Switch
              checked={premiumOnly}
              onCheckedChange={setPremiumOnly}
              className={premiumOnly ? "data-[state=checked]:bg-yellow-500" : ""}
            />
            <Crown className="h-3 w-3 text-yellow-500 shrink-0" />
            <span className="text-xs font-medium">Premium Only</span>
            <InfoTip text="When ON, Auto Start and Start All only process premium-flagged applications. Non-premium apps stay in the queue untouched." />
          </div>

          {/* Auto Start */}
          <div className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2 transition-colors ${
            autoStart ? 'border-green-500/40 bg-green-500/5' : 'border-border bg-accent/30'
          }`}>
            <Switch
              checked={autoStart}
              onCheckedChange={setAutoStart}
              className={autoStart ? "data-[state=checked]:bg-green-500" : ""}
            />
            <Play className="h-3 w-3 shrink-0" />
            <span className="text-xs font-medium">Auto Start</span>
            <InfoTip text="When ON, every eligible pending application starts automatically 2 seconds after it arrives. Extras queue up and start as slots free." />
          </div>

          {/* Concurrency slider */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-accent/30 px-2.5 py-2">
            <span className="text-xs font-medium whitespace-nowrap">Concurrency</span>
            <input
              type="range"
              min={1}
              max={10}
              value={maxConcurrent}
              onChange={(e) => setPrefs({ maxConcurrent: Number(e.target.value) })}
              className="flex-1 accent-primary cursor-pointer"
            />
            <span className="text-xs font-mono w-4 text-center shrink-0">{maxConcurrent}</span>
            <InfoTip text="Controls how many SSE streams this browser opens at once. The server-side Kernel gate may queue further — this is the client dispatch limit." />
          </div>

          {/* Start All + backlog in one cell */}
          <div className="flex items-center gap-2">
            {!autoStart && (
              <>
                <Button
                  size="sm"
                  onClick={() => {
                    setIsStartingAll(true)
                    for (const app of eligiblePending) enqueueOrStart(app)
                    setIsStartingAll(false)
                  }}
                  disabled={isStartingAll || eligiblePending.length === 0}
                  className="gap-1.5 h-8 flex-1 min-[480px]:flex-none"
                >
                  {isStartingAll
                    ? <><Loader className="h-3.5 w-3.5 animate-spin" /> Starting...</>
                    : <><Play className="h-3.5 w-3.5" /> Start All{eligiblePending.length > 0 ? ` (${eligiblePending.length})` : ''}</>
                  }
                </Button>
                <InfoTip text={`Immediately dispatches all ${eligiblePending.length} eligible pending application(s). Runs ${maxConcurrent} at a time — the rest wait in line.`} />
              </>
            )}
            {localQueueDepth > 0 && (
              <div className="flex items-center gap-1.5 rounded-md border border-blue-500/30 bg-blue-500/5 px-2.5 py-1.5">
                <span className="text-xs text-blue-500 font-medium">{localQueueDepth} waiting</span>
                <InfoTip text="Applications queued locally, waiting for a concurrency slot to free up." />
              </div>
            )}
          </div>
        </div>

        {/* Active mode pill — full width below the grid */}
        {(autoStart || premiumOnly) && (
          <div className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium self-start
            border-green-500/30 bg-green-500/5 text-green-600">
            {autoStart && premiumOnly && <><Crown className="h-3 w-3 text-yellow-500" /> Auto · Premium only</>}
            {autoStart && !premiumOnly && <><span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" /></span> Auto-starting all</>}
            {!autoStart && premiumOnly && <><Crown className="h-3 w-3 text-yellow-500" /> Premium filter on</>}
          </div>
        )}
      </div>

      <PortalHealthStrip />

      {/* Search + tabs */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, company or job..."
              className="pl-9 bg-card border-border w-full"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setQueuePage(1) }}
            />
          </div>
          <Select
            value={selectedCandidateFilter}
            onValueChange={(v) => { setSelectedCandidateFilter(v === "__all__" ? "" : v); setQueuePage(1) }}
          >
            <SelectTrigger className="h-10 text-xs w-[160px] shrink-0 bg-card border-border">
              <SelectValue placeholder="All candidates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__" className="text-xs">All candidates</SelectItem>
              {[...new Map(applications.map(a => [a.user_id, a])).values()]
                .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
                .map(a => (
                  <SelectItem key={a.user_id} value={a.user_id} className="text-xs">
                    {a.first_name} {a.last_name} ({applications.filter(x => x.user_id === a.user_id && x.status === 'pending').length} pending)
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tabs — always horizontally scrollable, never wraps */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setQueuePage(1); setSelectedCandidateFilter("") }} className="w-full">
          <div className="-mx-3 sm:mx-0 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <TabsList className="bg-card border border-border inline-flex w-max px-1 mx-3 sm:mx-0">
              <TabsTrigger value="all" className="text-xs px-2.5" onClick={() => { setActiveTab("all"); setQueuePage(1) }}>All ({applications.length})</TabsTrigger>
              <TabsTrigger value="premium" className="text-xs px-2.5">
                <Crown className="h-3 w-3 text-yellow-500 mr-1" />Premium ({premiumApps.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="text-xs px-2.5">Pending ({pending.length})</TabsTrigger>
              <TabsTrigger value="processing" className="text-xs px-2.5">Processing ({processing.length})</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs px-2.5">Done ({completed.length})</TabsTrigger>
              <TabsTrigger value="failed" className="text-xs px-2.5">Failed ({failed.length})</TabsTrigger>
              <TabsTrigger value="awaiting_otp" className="text-xs px-2.5">OTP ({awaitingOtp.length})</TabsTrigger>
              <TabsTrigger value="awaiting_captcha" className="text-xs px-2.5">CAPTCHA ({awaitingCaptcha.length})</TabsTrigger>
              <TabsTrigger value="blocked" className="text-xs px-2.5">Blocked ({blocked.length})</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {paginatedApps.map((app) => {
          const fullName = `${app.first_name} ${app.last_name}`
          const createdDate = new Date(app.created_at).toISOString().slice(0, 16).replace('T', ' ')
          const atsName = app.portal_name ?? detectAts(app.job_url)
          return (
            <Card key={app.id} className={`bg-card border-border hover:border-primary/30 transition-colors cursor-pointer ${app.is_premium ? 'ring-1 ring-yellow-500/30' : ''}`} onClick={() => setSelectedApp(app)}>
              <CardContent className="p-3">
                {/* Name + status */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-semibold truncate">{fullName}</p>
                      {app.is_premium && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Crown className="h-3 w-3 text-yellow-500 shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Premium user</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{app.phone}</p>
                  </div>
                  <StatusBadge status={app.status} className="shrink-0" />
                </div>

                {/* Company + job */}
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-accent-foreground">
                    {app.company_name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{app.company_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{app.job_title}</p>
                  </div>
                </div>

                {/* Badges */}
                {app.knockout_blocked && (
                  <div className="flex items-start gap-1.5 mb-2">
                    <Badge variant="outline" className="text-[9px] gap-1 text-destructive border-destructive/30 shrink-0">
                      <CircleSlash className="h-2.5 w-2.5 shrink-0" /> Won&apos;t apply
                    </Badge>
                    <span className="text-[9px] text-muted-foreground line-clamp-2">{app.knockout_reason || app.last_error}</span>
                  </div>
                )}
                {!app.knockout_blocked && (app.coverage_blocking_missing?.length ?? 0) > 0 && (
                  <div className="mb-2">
                    <Badge variant="outline" className="text-[9px] gap-1 text-orange-500 border-orange-500/30 max-w-full">
                      <TriangleAlert className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">Missing: {app.coverage_blocking_missing!.join(", ")}</span>
                    </Badge>
                  </div>
                )}
                {!app.knockout_blocked && app.coverage_percent != null && app.coverage_percent < 100 && !(app.coverage_blocking_missing?.length) && (
                  <div className="mb-2">
                    <Badge variant="outline" className="text-[9px] gap-1 text-muted-foreground">{app.coverage_percent}% fillable</Badge>
                  </div>
                )}
                {app.confirmation_id && (
                  <div className="mb-2">
                    <Badge variant="outline" className="text-[9px] gap-1 text-green-600 border-green-500/30 font-mono max-w-full">
                      <Receipt className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{app.confirmation_id}</span>
                    </Badge>
                  </div>
                )}
                {app.failed_step && app.status === 'failed' && (
                  <div className="mb-2">
                    <Badge variant="outline" className="text-[9px] gap-1 text-destructive border-destructive/30">
                      <XCircle className="h-2.5 w-2.5 shrink-0" /> Failed at: {stepLabel(app.failed_step)}
                    </Badge>
                  </div>
                )}
                {app.attempt_count > 0 && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Badge variant="outline" className={`text-[9px] gap-1 ${app.status === 'failed' ? 'text-destructive border-destructive/30' : 'text-orange-500 border-orange-500/30'}`}>
                      Attempt {app.attempt_count}/{app.max_attempts || 2}
                    </Badge>
                    {app.last_error && app.status === 'pending' && (
                      <span className="text-[9px] text-orange-500 truncate">Retrying...</span>
                    )}
                  </div>
                )}

                {/* Footer row */}
                <div className="flex items-center justify-between gap-1 mt-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-muted-foreground shrink-0">{createdDate}</span>
                    {atsName && (
                      <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-500 shrink-0">
                        {atsName}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {runCost(app) !== null && (
                      <span
                        className="text-[10px] tabular-nums text-muted-foreground px-1"
                        title={`Kernel browser time: ${runSeconds(app)!.toFixed(1)}s at $${KERNEL_RATES.headful}/sec`}
                      >
                        {formatCost(runCost(app))}
                      </span>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setSelectedApp(app) }}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(app.id) }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>


                {/* OTP input */}
                {app.status === 'awaiting_otp' && (
                  <div className="mt-3 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <Input placeholder="Enter OTP..." className="h-7 text-xs flex-1 min-w-0" value={otpInputs[app.id] || ''} onChange={(e) => setOtpInputs(prev => ({ ...prev, [app.id]: e.target.value }))} />
                      <Button size="sm" className="h-7 text-xs gap-1 shrink-0" disabled={!otpInputs[app.id] || savingOtp[app.id]} onClick={() => handleSaveOtp(app.id, otpInputs[app.id])}>
                        {savingOtp[app.id] ? <Loader className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                        {savingOtp[app.id] ? 'Saving...' : 'Submit'}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Backend will pick it up and resume automatically</p>
                  </div>
                )}

                {/* CAPTCHA */}
                {app.status === 'awaiting_captcha' && (
                  <div className="mt-3 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
                    <p className="text-[10px] text-muted-foreground mb-2">Browser session is live. Solve the CAPTCHA then mark as solved.</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {app.live_url && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => window.open(app.live_url!, '_blank')}>
                          <ExternalLink className="h-3 w-3" /> Open Browser
                        </Button>
                      )}
                      <Button size="sm" className="h-7 text-xs gap-1 bg-red-600 hover:bg-red-700" disabled={resolvingCaptcha[app.id]} onClick={() => handleResolveCaptcha(app.id)}>
                        {resolvingCaptcha[app.id] ? <Loader className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
                        {resolvingCaptcha[app.id] ? 'Resuming...' : 'Mark as Solved'}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Pagination */}
      {totalQueuePages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span className="text-xs text-muted-foreground">Showing {((safePage - 1) * QUEUE_PER_PAGE) + 1}–{Math.min(safePage * QUEUE_PER_PAGE, totalFilteredApps)} of {totalFilteredApps}</span>
          <div className="flex items-center justify-between sm:justify-end gap-2">
            <Button size="sm" variant="outline" className="text-xs h-8" disabled={safePage === 1} onClick={() => setQueuePage(p => p - 1)}>Previous</Button>
            <span className="text-xs text-muted-foreground whitespace-nowrap">Page {safePage} of {totalQueuePages}</span>
            <Button size="sm" variant="outline" className="text-xs h-8" disabled={safePage === totalQueuePages} onClick={() => setQueuePage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

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
        onOpenChange={(open) => {
          // Don't close by clicking outside if this app is currently running
          if (!open && selectedApp && streamingApps.has(selectedApp.id)) return
          if (!open) setSelectedApp(null)
        }}
      >
        <DialogContent
          className="w-[95vw] max-w-4xl bg-card border-border p-0"
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
              canStart={processingCountRef.current < maxConcurrentRef.current && !streamingApps.has(selectedApp.id)}
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
                className={`rounded-xl border shadow-lg bg-card transition-all duration-200 ${
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
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
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
                    <div className="flex items-center gap-1 mt-0.5">
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
                    {/* Fix #10: show local queue backlog in tray */}
                    {localQueueDepth > 0 && (
                      <span className="text-[10px] text-blue-500">{localQueueDepth} more waiting…</span>
                    )}
                    {/* Open detail button */}
                    <button
                      className="text-[10px] text-primary hover:underline text-left mt-0.5"
                      onClick={() => {
                        const full = applications.find(a => a.id === app.id)
                        if (full) setSelectedApp(full)
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

"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { StatusBadge } from "@/components/status-badge"
import { ApplicationDetails } from "@/components/application-details"
import { LiveApplicationQueue, ApplicationStats } from "@/lib/types/live-queue.types"
import { useLogs } from "@/lib/logs-context"
import {
  Search, Eye, Trash2, Loader, KeyRound, ShieldAlert, ExternalLink
} from "lucide-react"

export function QueueScreen() {
  const [selectedApp, setSelectedApp] = useState<LiveApplicationQueue | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [applications, setApplications] = useState<LiveApplicationQueue[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [stats, setStats] = useState<ApplicationStats>({ totalApps: 0, successful: 0, failed: 0, inProgress: 0 })
  const [isStreaming, setIsStreaming] = useState(false)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [isStartingAll, setIsStartingAll] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({})
  const [savingOtp, setSavingOtp] = useState<Record<string, boolean>>({})
  const [resolvingCaptcha, setResolvingCaptcha] = useState<Record<string, boolean>>({})
  const [premiumOnly, setPremiumOnly] = useState(false)

  const [queuePage, setQueuePage] = useState(1)
  const QUEUE_PER_PAGE = 10
  const prevPendingIdsRef = useRef<Set<string>>(new Set())
  const autoStartTimersRef = useRef<Record<string, NodeJS.Timeout>>({})
  const processingCountRef = useRef(0)
  const pendingQueueRef = useRef<LiveApplicationQueue[]>([])
  const MAX_CONCURRENT = 3
  const { addLog } = useLogs()

  const handleSaveOtp = async (appId: string, otp: string) => {
    setSavingOtp(prev => ({ ...prev, [appId]: true }))

    try {
      await fetch('/api/live-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId, verification_otp: otp })
      })

      addLog({
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "info",
        agentId: appId,
        message: `OTP saved. Backend will pick it up and resume automation automatically.`,
        applicationId: appId,
      })

      setOtpInputs(prev => { const n = { ...prev }; delete n[appId]; return n })
    } catch (error) {
      addLog({
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "error",
        agentId: appId,
        message: `Failed to save OTP: ${error instanceof Error ? error.message : 'Unknown error'}`,
        applicationId: appId,
      })
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
        body: JSON.stringify({ id: appId, status: 'processing' })
      })

      setApplications(prev => prev.map(a =>
        a.id === appId ? { ...a, status: 'processing' as const } : a
      ))

      addLog({
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "info",
        agentId: appId,
        message: `CAPTCHA marked as solved. Automation will resume automatically.`,
        applicationId: appId,
      })
    } catch (error) {
      addLog({
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "error",
        agentId: appId,
        message: `Failed to mark CAPTCHA as solved: ${error instanceof Error ? error.message : 'Unknown error'}`,
        applicationId: appId,
      })
    } finally {
      setResolvingCaptcha(prev => ({ ...prev, [appId]: false }))
    }
  }

  const processNext = () => {
    while (processingCountRef.current < MAX_CONCURRENT && pendingQueueRef.current.length > 0) {
      const next = pendingQueueRef.current.shift()!
      startApplication(next)
    }
  }

  const enqueueOrStart = (app: LiveApplicationQueue) => {
    if (processingCountRef.current < MAX_CONCURRENT) {
      startApplication(app)
    } else {
      if (!pendingQueueRef.current.some(a => a.id === app.id)) {
        pendingQueueRef.current.push(app)
      }
    }
  }

  const startApplication = async (app: LiveApplicationQueue) => {
    processingCountRef.current++
    setIsStreaming(true)
    setRecordingUrl(null)
    
    await fetch('/api/live-queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: app.id, status: 'processing' })
    })
    
    setApplications(prev => prev.map(a => 
      a.id === app.id ? { ...a, status: 'processing' as const } : a
    ))
    
    addLog({
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      agentId: app.id,
      message: `Starting task for ${app.first_name} ${app.last_name} - ${app.job_title} at ${app.company_name} (${processingCountRef.current}/${MAX_CONCURRENT} slots used)`,
      applicationId: app.id,
    })
    
    try {
      const response = await fetch("/api/auto-apply-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          applicationId: app.id,
          stream: true,
        }),
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response stream')
      }

      let hasStarted = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (!hasStarted && (data.log || data.status)) {
                hasStarted = true
              }
              
              if (data.log) {
                addLog({
                  id: `log-${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  level: data.status === "error" ? "error" : "info",
                  agentId: app.id,
                  message: data.log,
                  applicationId: app.id,
                })
              }
              if (data.status === "retrying") {
                addLog({
                  id: `log-${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  level: "warn",
                  agentId: app.id,
                  message: `Attempt ${data.attempt}/${data.maxAttempts} failed: ${data.error}. Will retry automatically...`,
                  applicationId: app.id,
                })
                
                setApplications(prev => prev.map(a => 
                  a.id === app.id ? { ...a, status: 'pending' as const } : a
                ))
              }
              if (data.status === "error") {
                addLog({
                  id: `log-${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  level: "error",
                  agentId: app.id,
                  message: `All ${data.maxAttempts || 1} attempts failed: ${data.error || "An error occurred"}`,
                  applicationId: app.id,
                })
                
                setApplications(prev => prev.map(a => 
                  a.id === app.id ? { ...a, status: 'failed' as const } : a
                ))
              }
              if (data.status === "awaiting_captcha") {
                addLog({
                  id: `log-${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  level: "warn",
                  agentId: app.id,
                  message: `CAPTCHA detected. Browser session is live — waiting for human to solve it.${data.liveUrl ? ` Live URL: ${data.liveUrl}` : ''}`,
                  applicationId: app.id,
                })
                
                setApplications(prev => prev.map(a => 
                  a.id === app.id ? { ...a, status: 'awaiting_captcha' as const, live_url: data.liveUrl || a.live_url } : a
                ))
              }
              if (data.status === "awaiting_otp") {
                addLog({
                  id: `log-${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  level: "warn",
                  agentId: app.id,
                  message: `OTP verification required. Automation paused. Waiting for OTP...`,
                  applicationId: app.id,
                })
                
                setApplications(prev => prev.map(a => 
                  a.id === app.id ? { ...a, status: 'awaiting_otp' as const } : a
                ))
              }
              if (data.status === "completed") {
                addLog({
                  id: `log-${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  level: "info",
                  agentId: app.id,
                  message: `Application completed successfully after ${data.steps} steps`,
                  applicationId: app.id,
                })
                
                const updatePayload: any = { id: app.id, status: 'completed' }
                if (data.recordingUrl) {
                  updatePayload.recording_url = data.recordingUrl
                  setRecordingUrl(data.recordingUrl)
                  addLog({
                    id: `log-${Date.now()}-${Math.random()}`,
                    timestamp: new Date().toLocaleTimeString(),
                    level: "info",
                    agentId: app.id,
                    message: `Recording saved: ${data.recordingUrl}`,
                    applicationId: app.id,
                  })
                }
                
                await fetch('/api/live-queue', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updatePayload)
                })
                
                setApplications(prev => prev.map(a => 
                  a.id === app.id ? { ...a, status: 'completed' as const, recording_url: data.recordingUrl || a.recording_url } : a
                ))
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
      
      if (!hasStarted) {
        throw new Error('Task failed to start')
      }
    } catch (error) {
      console.error('Task error:', error)
      addLog({
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "error",
        agentId: app.id,
        message: `Task error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        applicationId: app.id,
      })
    } finally {
      processingCountRef.current--
      setIsStreaming(processingCountRef.current > 0)
      processNext()
    }
  }

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        const response = await fetch('/api/live-queue')
        const data = await response.json()
        
        if (Array.isArray(data)) {
          setApplications(data)
          
          // Calculate stats
          const totalApps = data.length
          const successful = data.filter((app: LiveApplicationQueue) => app.status === 'completed').length
          const failed = data.filter((app: LiveApplicationQueue) => app.status === 'failed').length
          const inProgress = data.filter((app: LiveApplicationQueue) => app.status === 'pending' || app.status === 'processing' || app.status === 'awaiting_otp' || app.status === 'awaiting_captcha').length
          
          setStats({ totalApps, successful, failed, inProgress })
        }
      } catch (err) {
        console.error('Failed to fetch applications:', err)
      }
    }
    
    fetchApplications()
    const interval = setInterval(fetchApplications, 3000)
    return () => clearInterval(interval)
  }, [])

  // Auto-start: when autoStart is ON, start pending apps after 4 seconds
  useEffect(() => {
    if (!autoStart) {
      // Clear all pending timers when auto-start is turned off
      Object.values(autoStartTimersRef.current).forEach(clearTimeout)
      autoStartTimersRef.current = {}
      return
    }

    const pendingApps = applications.filter(a => 
      a.status === 'pending' && (!premiumOnly || a.is_premium)
    )

    // Set timers for new pending apps
    for (const app of pendingApps) {
      if (!autoStartTimersRef.current[app.id]) {
        autoStartTimersRef.current[app.id] = setTimeout(() => {
          delete autoStartTimersRef.current[app.id]
          enqueueOrStart(app)
        }, 2000)
      }
    }

    // Clean up timers for apps no longer pending
    const pendingIds = new Set(pendingApps.map(a => a.id))
    for (const id of Object.keys(autoStartTimersRef.current)) {
      if (!pendingIds.has(id)) {
        clearTimeout(autoStartTimersRef.current[id])
        delete autoStartTimersRef.current[id]
      }
    }

    return () => {
      Object.values(autoStartTimersRef.current).forEach(clearTimeout)
      autoStartTimersRef.current = {}
    }
  }, [autoStart, premiumOnly, applications])


  const handleDelete = async (id: string) => {
    try {
      await fetch('/api/live-queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      setApplications(applications.filter(app => app.id !== id))
      setDeleteId(null)
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const filteredApps = applications.filter((app) => {
    if (activeTab === "premium") {
      if (!app.is_premium) return false
    } else if (activeTab !== "all" && app.status !== activeTab) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const fullName = `${app.first_name} ${app.last_name}`.toLowerCase()
      return (
        fullName.includes(q) ||
        app.company_name.toLowerCase().includes(q) ||
        app.job_title.toLowerCase().includes(q)
      )
    }
    return true
  })

  const totalFilteredApps = filteredApps.length
  const totalQueuePages = Math.ceil(totalFilteredApps / QUEUE_PER_PAGE)
  const paginatedApps = filteredApps.slice(
    (queuePage - 1) * QUEUE_PER_PAGE,
    queuePage * QUEUE_PER_PAGE
  )

  const pending = applications.filter((a) => a.status === "pending")
  const processing = applications.filter((a) => a.status === "processing")
  const completed = applications.filter((a) => a.status === "completed")
  const failed = applications.filter((a) => a.status === "failed")
  const awaitingOtp = applications.filter((a) => a.status === "awaiting_otp")
  const awaitingCaptcha = applications.filter((a) => a.status === "awaiting_captcha")
  const premiumApps = applications.filter((a) => a.is_premium)

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gradient">Live Application Queue</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Real-time monitoring of all application submissions</p>
        </div>

      </div>

      {/* Controls: Start All, Auto-Start, Premium Only */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <Switch checked={premiumOnly} onCheckedChange={setPremiumOnly} />
          <span className="text-xs text-muted-foreground">Premium Only</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={autoStart} onCheckedChange={setAutoStart} />
          <span className="text-xs text-muted-foreground">Auto Start</span>
        </div>
        {!autoStart && pending.length > 0 && (
          <Button
            size="sm"
            onClick={() => {
              setIsStartingAll(true)
              const appsToStart = premiumOnly ? pending.filter(a => a.is_premium) : pending
              for (const app of appsToStart) {
                enqueueOrStart(app)
              }
              setIsStartingAll(false)
            }}
            disabled={isStartingAll}
            className="gap-2"
          >
            {isStartingAll ? (
              <>
                <Loader className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              `Start All (${premiumOnly ? pending.filter(a => a.is_premium).length : pending.length})`
            )}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search applications..."
              className="pl-9 bg-card border-border"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setQueuePage(1) }}
            />
          </div>
          <div className="flex items-center gap-1.5 sm:ml-auto">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-xs text-muted-foreground">Auto-refresh: ON</span>
          </div>
        </div>
        {/* Tabs row — horizontal scroll on mobile */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setQueuePage(1) }} className="w-full">
          <div className="-mx-3 sm:mx-0 px-3 sm:px-0 overflow-x-auto scrollbar-hide">
            <TabsList className="bg-card border border-border w-max sm:w-auto inline-flex">
              <TabsTrigger value="all" className="text-xs">All ({applications.length})</TabsTrigger>
              <TabsTrigger value="premium" className="text-xs">Premium ({premiumApps.length})</TabsTrigger>
              <TabsTrigger value="pending" className="text-xs">Pending ({pending.length})</TabsTrigger>
              <TabsTrigger value="processing" className="text-xs">Processing ({processing.length})</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs">Done ({completed.length})</TabsTrigger>
              <TabsTrigger value="failed" className="text-xs">Failed ({failed.length})</TabsTrigger>
              <TabsTrigger value="awaiting_otp" className="text-xs">Awaiting OTP ({awaitingOtp.length})</TabsTrigger>
              <TabsTrigger value="awaiting_captcha" className="text-xs">CAPTCHA ({awaitingCaptcha.length})</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {paginatedApps.map((app) => {
          const fullName = `${app.first_name} ${app.last_name}`
          const createdDate = new Date(app.created_at).toLocaleString()
          
          return (
            <Card key={app.id} className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setSelectedApp(app)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold">{fullName}</p>
                    <p className="text-xs text-muted-foreground">{app.phone}</p>
                  </div>
                  <StatusBadge status={app.status} />
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-accent-foreground">
                    {app.company_name[0]}
                  </div>
                  <div>
                    <p className="text-xs font-medium">{app.company_name}</p>
                    <p className="text-[11px] text-muted-foreground">{app.job_title}</p>
                  </div>
                </div>

                {/* Retry indicator */}
                {(app.attempt_count > 0) && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Badge variant="outline" className={`text-[9px] gap-1 ${app.status === 'failed' ? 'text-destructive border-destructive/30' : 'text-orange-500 border-orange-500/30'}`}>
                      Attempt {app.attempt_count}/{app.max_attempts || 2}
                    </Badge>
                    {app.last_error && app.status === 'pending' && (
                      <span className="text-[9px] text-orange-500 truncate max-w-[180px]">Retrying...</span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground">{createdDate}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {app.status === 'awaiting_otp' && (
                      <Badge variant="outline" className="text-[9px] text-orange-500 border-orange-500/30 gap-1">
                        <KeyRound className="h-2.5 w-2.5" /> OTP Required
                      </Badge>
                    )}
                    {app.status === 'awaiting_captcha' && (
                      <Badge variant="outline" className="text-[9px] text-red-500 border-red-500/30 gap-1">
                        <ShieldAlert className="h-2.5 w-2.5" /> CAPTCHA Required
                      </Badge>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setSelectedApp(app) }}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(app.id) }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Inline OTP input for awaiting_otp cards */}
                {app.status === 'awaiting_otp' && (
                  <div className="mt-3 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Enter OTP..."
                        className="h-7 text-xs flex-1"
                        value={otpInputs[app.id] || ''}
                        onChange={(e) => setOtpInputs(prev => ({ ...prev, [app.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={!otpInputs[app.id] || savingOtp[app.id]}
                        onClick={() => handleSaveOtp(app.id, otpInputs[app.id])}
                      >
                        {savingOtp[app.id] ? <Loader className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                        {savingOtp[app.id] ? 'Saving...' : 'Submit OTP'}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Enter the OTP — backend will automatically pick it up and resume</p>
                  </div>
                )}
                {/* Inline CAPTCHA action for awaiting_captcha cards */}
                {app.status === 'awaiting_captcha' && (
                  <div className="mt-3 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
                    <p className="text-[10px] text-muted-foreground mb-2">Browser session is live. Open it, solve the CAPTCHA, then mark as solved.</p>
                    <div className="flex items-center gap-2">
                      {app.live_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => window.open(app.live_url!, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open Browser
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1 bg-red-600 hover:bg-red-700"
                        disabled={resolvingCaptcha[app.id]}
                        onClick={() => handleResolveCaptcha(app.id)}
                      >
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
          <span className="text-xs text-muted-foreground">Showing {((queuePage - 1) * QUEUE_PER_PAGE) + 1}-{Math.min(queuePage * QUEUE_PER_PAGE, totalFilteredApps)} of {totalFilteredApps}</span>
          <div className="flex items-center justify-between sm:justify-end gap-2">
            <Button size="sm" variant="outline" className="text-xs h-8" disabled={queuePage === 1} onClick={() => setQueuePage(p => p - 1)}>Previous</Button>
            <span className="text-xs text-muted-foreground whitespace-nowrap">Page {queuePage} of {totalQueuePages}</span>
            <Button size="sm" variant="outline" className="text-xs h-8" disabled={queuePage === totalQueuePages} onClick={() => setQueuePage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Application</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this application? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDelete(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Application Detail Modal */}
      <Dialog open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <DialogContent className="w-full max-w-full sm:max-w-4xl max-h-[92dvh] overflow-y-auto bg-card border-border p-0">
          <DialogTitle className="sr-only">Application Details</DialogTitle>
          {selectedApp && (
            <ApplicationDetails 
              application={selectedApp} 
              stats={stats}
              onStartApplication={() => startApplication(selectedApp)}
              isStreaming={isStreaming}
              recordingUrl={recordingUrl}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

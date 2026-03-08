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
import { StatusBadge } from "@/components/status-badge"
import { ApplicationDetails } from "@/components/application-details"
import { LiveApplicationQueue, ApplicationStats } from "@/lib/types/live-queue.types"
import { useLogs } from "@/lib/logs-context"
import {
  Search, Eye, Trash2, Loader, Power
} from "lucide-react"

export function QueueScreen() {
  const [selectedApp, setSelectedApp] = useState<LiveApplicationQueue | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [applications, setApplications] = useState<LiveApplicationQueue[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [stats, setStats] = useState<ApplicationStats>({ totalApps: 0, successful: 0, failed: 0, inProgress: 0 })
  const [isStreaming, setIsStreaming] = useState(false)
  const [liveStreamUrl, setLiveStreamUrl] = useState<string | null>(null)
  const [isStartingAll, setIsStartingAll] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const prevPendingIdsRef = useRef<Set<string>>(new Set())
  const { addLog } = useLogs()

  const startLiveStream = async (app: LiveApplicationQueue) => {
    setIsStreaming(true)
    setLiveStreamUrl(null)
    
    // Update status to processing
    await fetch('/api/live-queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: app.id, status: 'processing' })
    })
    
    // Update local state
    setApplications(prev => prev.map(a => 
      a.id === app.id ? { ...a, status: 'processing' as const } : a
    ))
    
    // Add initial log
    addLog({
      id: `log-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      level: "info",
      agentId: app.id,
      message: `Starting live stream for ${app.first_name} ${app.last_name} - ${app.job_title} at ${app.company_name}`,
      applicationId: app.id,
    })
    
    try {
      const response = await fetch("/api/auto-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: app.user_id,
          jobId: app.job_id,
          stream: true,
          applicationData: app
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
              
              // Mark as started if we get any valid data
              if (!hasStarted && (data.liveUrl || data.log || data.status)) {
                hasStarted = true
              }
              
              // Capture live stream URL from session creation or streaming
              if (data.liveUrl) {
                console.log('Setting live stream URL:', data.liveUrl)
                setLiveStreamUrl(data.liveUrl)
                
                // Update database with live URL
                fetch('/api/live-queue', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: app.id, live_url: data.liveUrl })
                }).catch(err => console.error('Failed to update live URL:', err))
                
                if (data.status === 'session_created') {
                  addLog({
                    id: `log-${Date.now()}-${Math.random()}`,
                    timestamp: new Date().toLocaleTimeString(),
                    level: "info",
                    agentId: app.id,
                    message: `Live stream available at: ${data.liveUrl}`,
                    applicationId: app.id,
                  })
                }
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
              if (data.status === "error") {
                addLog({
                  id: `log-${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  level: "error",
                  agentId: app.id,
                  message: data.error || "An error occurred",
                  applicationId: app.id,
                })
                
                // Update status to failed
                await fetch('/api/live-queue', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: app.id, status: 'failed' })
                })
                
                setApplications(prev => prev.map(a => 
                  a.id === app.id ? { ...a, status: 'failed' as const } : a
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
                
                // Update status and recording URL
                const updatePayload: any = { id: app.id, status: 'completed' }
                if (data.recordingUrl) {
                  updatePayload.recording_url = data.recordingUrl
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
      
      // If stream ended but never started, mark as failed
      if (!hasStarted) {
        throw new Error('Stream failed to start')
      }
    } catch (error) {
      console.error('Live stream error:', error)
      addLog({
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: "error",
        agentId: app.id,
        message: `Live stream error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        applicationId: app.id,
      })
      
      // Update status to failed
      await fetch('/api/live-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: app.id, status: 'failed' })
      })
      
      setApplications(prev => prev.map(a => 
        a.id === app.id ? { ...a, status: 'failed' as const } : a
      ))
    } finally {
      setIsStreaming(false)
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
          const inProgress = data.filter((app: LiveApplicationQueue) => app.status === 'pending' || app.status === 'processing').length
          
          setStats({ totalApps, successful, failed, inProgress })
          
          // Auto-start new pending applications
          if (autoStart) {
            const currentPending = data.filter((app: LiveApplicationQueue) => app.status === 'pending')
            const currentPendingIds = new Set(currentPending.map((app: LiveApplicationQueue) => app.id))
            
            // Find new pending applications
            const newPendingApps = currentPending.filter(
              (app: LiveApplicationQueue) => !prevPendingIdsRef.current.has(app.id)
            )
            
            // Start live stream for new pending applications
            newPendingApps.forEach((app: LiveApplicationQueue) => {
              startLiveStream(app)
            })
            
            prevPendingIdsRef.current = currentPendingIds
          }
        }
      } catch (err) {
        console.error('Failed to fetch applications:', err)
      }
    }
    
    fetchApplications()
    const interval = setInterval(fetchApplications, 5000)
    return () => clearInterval(interval)
  }, [autoStart])

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
    if (activeTab !== "all" && app.status !== activeTab) return false
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

  const pending = applications.filter((a) => a.status === "pending")
  const processing = applications.filter((a) => a.status === "processing")
  const completed = applications.filter((a) => a.status === "completed")
  const failed = applications.filter((a) => a.status === "failed")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Live Application Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time monitoring of all application submissions</p>
      </div>

      {/* Start All Button & Auto-Start Toggle - Only show when on pending tab */}
      {activeTab === "pending" && pending.length > 0 && (
        <div className="flex justify-end gap-2">
          <Button
            onClick={() => setAutoStart(!autoStart)}
            variant={autoStart ? "default" : "outline"}
            className="gap-2"
          >
            <Power className={`h-4 w-4 ${autoStart ? 'text-green-500' : ''}`} />
            Auto Start: {autoStart ? 'ON' : 'OFF'}
          </Button>
          <Button
            onClick={async () => {
              setIsStartingAll(true)
              for (const app of pending) {
                startLiveStream(app)
                // Small delay to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100))
              }
              setIsStartingAll(false)
            }}
            disabled={isStartingAll}
            className="gap-2"
          >
            {isStartingAll ? (
              <>
                <Loader className="h-4 w-4 animate-spin" />
                Starting All...
              </>
            ) : (
              `Start All (${pending.length})`
            )}
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search applications..."
            className="pl-9 bg-card border-border"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="all" className="text-xs">All ({applications.length})</TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">Pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="processing" className="text-xs">Processing ({processing.length})</TabsTrigger>
            <TabsTrigger value="completed" className="text-xs">Done ({completed.length})</TabsTrigger>
            <TabsTrigger value="failed" className="text-xs">Failed ({failed.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
          </span>
          <span className="text-xs text-muted-foreground">Auto-refresh: ON</span>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredApps.map((app) => {
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

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground">{createdDate}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setSelectedApp(app) }}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(app.id) }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border p-0">
          <DialogTitle className="sr-only">Application Details</DialogTitle>
          {selectedApp && (
            <ApplicationDetails 
              application={selectedApp} 
              stats={stats}
              onStartLiveStream={() => startLiveStream(selectedApp)}
              isStreaming={isStreaming}
              liveStreamUrl={liveStreamUrl}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

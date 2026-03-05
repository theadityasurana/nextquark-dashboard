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
import { useAutoApply } from "@/hooks/use-auto-apply"
import { mockApplications, mockUsers, mockJobs, mockCompanies, type Application } from "@/lib/mock-data"
import { useLogs } from "@/lib/logs-context"
import {
  Search, Eye, Trash2, FileText, ExternalLink, Monitor, Zap,
  User as UserIcon, Heart, Shield, Globe, Loader
} from "lucide-react"

export function QueueScreen() {
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [supabaseApps, setSupabaseApps] = useState<Application[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    const fetchSupabaseApps = async () => {
      try {
        const response = await fetch('/api/live-queue')
        const data = await response.json()
        
        if (Array.isArray(data)) {
          const apps = data.map((row: any) => ({
            id: row.id,
            userId: row.user_id,
            userName: row.user_name,
            userEmail: row.user_email,
            userPhone: row.user_phone,
            userLocation: row.user_location,
            companyId: row.company_id,
            companyName: row.company_name,
            jobTitle: row.job_title,
            jobId: row.job_id,
            status: row.status,
            agentId: row.agent_id,
            progressStep: row.progress_step,
            totalSteps: row.total_steps,
            stepDescription: row.step_description,
            startedAt: row.started_at,
            duration: row.duration,
            createdAt: row.created_at,
            screenshot: row.screenshot,
            ...row
          }))
          setSupabaseApps(apps)
        }
      } catch (err) {
        // Silent fail
      }
    }
    
    fetchSupabaseApps()
    const interval = setInterval(fetchSupabaseApps, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleDelete = async (id: string) => {
    try {
      await fetch('/api/live-queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      setSupabaseApps(supabaseApps.filter(app => app.id !== id))
      setDeleteId(null)
    } catch (err) {
      // Silent fail
    }
  }

  const allApps = [...mockApplications, ...supabaseApps]

  const filteredApps = allApps.filter((app) => {
    if (activeTab !== "all" && app.status !== activeTab) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        app.userName.toLowerCase().includes(q) ||
        app.companyName.toLowerCase().includes(q) ||
        app.jobTitle.toLowerCase().includes(q)
      )
    }
    return true
  })

  const queued = allApps.filter((a) => a.status === "queued")
  const processing = allApps.filter((a) => a.status === "processing")
  const completed = allApps.filter((a) => a.status === "completed")
  const failed = allApps.filter((a) => a.status === "failed")

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Live Application Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time monitoring of all application submissions</p>
      </div>

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
            <TabsTrigger value="all" className="text-xs">All ({allApps.length})</TabsTrigger>
            <TabsTrigger value="queued" className="text-xs">Queued ({queued.length})</TabsTrigger>
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
        {filteredApps.map((app) => (
          <Card key={app.id} className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setSelectedApp(app)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold">{app.userName}</p>
                  <p className="text-xs text-muted-foreground">{app.userEmail}</p>
                </div>
                <StatusBadge status={app.status} />
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[10px] font-bold text-accent-foreground">
                  {app.companyName[0]}
                </div>
                <div>
                  <p className="text-xs font-medium">{app.companyName}</p>
                  <p className="text-[11px] text-muted-foreground">{app.jobTitle}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {app.agentId && <span className="text-[10px] font-mono text-muted-foreground">{app.agentId}</span>}
                  <span className="text-[10px] text-muted-foreground">{app.createdAt}</span>
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
        ))}
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
          {selectedApp && <ApplicationDetailModal app={selectedApp} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ApplicationDetailModal({ app }: { app: Application }) {
  let user = mockUsers.find(u => u.id === app.userId)
  
  // If user not in mock data, construct from Supabase fields
  if (!user && (app as any).user_headline) {
    user = {
      id: app.userId,
      name: app.userName,
      email: app.userEmail,
      phone: app.userPhone,
      location: app.userLocation,
      headline: (app as any).user_headline || '',
      experience: (app as any).user_experience || '',
      skills: (app as any).user_skills || [],
      resumeUrl: '',
      linkedinUrl: (app as any).user_linkedin_url || '',
      gender: (app as any).user_gender || '',
      ethnicity: (app as any).user_ethnicity || '',
      disabilityStatus: (app as any).user_disability_status || '',
      workExperience: (app as any).user_work_experience || [],
      education: (app as any).user_education || [],
      projects: (app as any).user_projects || [],
      coverLetter: (app as any).user_cover_letter || '',
      resumeSummary: (app as any).user_resume_summary || '',
      totalApps: 0,
      successfulApps: 0,
      failedApps: 0,
      inProgressApps: 0,
      lastActive: '',
      joinedAt: (app as any).user_joined_at || '',
      status: 'active' as const,
    }
  }
  
  const job = mockJobs.find(j => j.id === app.jobId)
  const { addLog } = useLogs()
  const [liveSteps, setLiveSteps] = useState<any[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamStatus, setStreamStatus] = useState<"idle" | "streaming" | "completed" | "error">("idle")
  const [isPaused, setIsPaused] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const startStreaming = async () => {
    if (!user || !job) return
    setIsStreaming(true)
    setStreamStatus("streaming")
    setLiveSteps([])
    setIsPaused(false)
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch("/api/auto-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, jobId: job.id, stream: true }),
        signal: abortControllerRef.current.signal,
      })

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) return

      while (true) {
        if (isPaused) {
          await new Promise(resolve => setTimeout(resolve, 100))
          continue
        }
        
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))
              setLiveSteps((prev) => [...prev, data])
              if (data.log) {
                addLog({
                  id: `log-${Date.now()}-${Math.random()}`,
                  timestamp: new Date().toLocaleTimeString(),
                  level: data.status === "error" ? "error" : "info",
                  agentId: app.agentId || "Agent-Unknown",
                  message: data.log,
                })
              }
              if (data.status === "completed") {
                setStreamStatus("completed")
              } else if (data.status === "error") {
                setStreamStatus("error")
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setStreamStatus("error")
      }
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Application Details</h2>
            <Badge variant="outline" className="font-mono text-[10px]">{app.id}</Badge>
          </div>
          <StatusBadge status={app.status} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          <Button
            size="sm"
            className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={startStreaming}
            disabled={isStreaming}
          >
            {isStreaming ? (
              <>
                <Loader className="h-3 w-3 animate-spin" /> Streaming...
              </>
            ) : (
              <>
                <Zap className="h-3 w-3" /> Start Live Stream
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Current Screenshot */}
      {app.screenshot && (
        <div className="px-6 py-4 border-b border-border bg-muted/50">
          <div className="rounded-lg overflow-hidden border border-border w-1/2">
            <img src={app.screenshot} alt="Current screenshot" className="w-full h-auto" />
          </div>
        </div>
      )}

      {/* Live Stream Monitor */}
      {isStreaming || liveSteps.length > 0 ? (
        <div className="px-6 py-5 border-b border-border bg-accent/10">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" /> Logs
          </h4>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {liveSteps.map((step, idx) => (
              <div key={idx} className="text-xs text-muted-foreground">
                {step.status === "in_progress" && (
                  <p>• {step.log}</p>
                )}
                {step.status === "completed" && (
                  <p className="text-success">✓ Application Submitted Successfully</p>
                )}
                {step.status === "error" && (
                  <p className="text-destructive">✗ Error: {step.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Full Biodata - Single Page View */}
      <div className="px-6 py-5 flex flex-col gap-5">
        {/* Application Link */}
        {job && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-2">Job Application Link</h4>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{job.title} at {job.companyName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{job.location} - {job.type} - {job.salaryRange}</p>
              </div>
              <div className="flex items-center gap-2">
                {job.portalUrl && (
                  <a href={job.portalUrl.startsWith("http") ? job.portalUrl : `https://${job.portalUrl}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="text-xs gap-1.5">
                      <ExternalLink className="h-3 w-3" /> Application Portal
                    </Button>
                  </a>
                )}
                {job.jobUrl && (
                  <a href={job.jobUrl.startsWith("http") ? job.jobUrl : `https://${job.jobUrl}`} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="text-xs gap-1.5">
                      <Globe className="h-3 w-3" /> Job Listing
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {user ? (
          <>
            {/* User Header */}
            <div className="rounded-lg border border-border p-5 bg-foreground/5">
              <div className="text-center mb-4 pb-3 border-b border-border">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary mx-auto mb-2">
                  {user.name.split(" ").map(n => n[0]).join("")}
                </div>
                <h3 className="text-lg font-bold">{user.name}</h3>
                <p className="text-sm text-muted-foreground">{user.headline}</p>
                <p className="text-xs text-muted-foreground mt-1">{user.email} | {user.phone} | {user.location}</p>
                <p className="text-xs text-primary mt-0.5">{user.linkedinUrl}</p>
              </div>

              {/* Summary */}
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-1.5">Professional Summary</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{user.resumeSummary}</p>
              </div>

              <Separator className="my-3" />

              {/* Personal Information */}
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Personal Information</h4>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <span className="text-muted-foreground flex items-center gap-1"><UserIcon className="h-3 w-3" /> Gender</span>
                  <span className="font-medium col-span-2">{user.gender}</span>
                  <span className="text-muted-foreground flex items-center gap-1"><Heart className="h-3 w-3" /> Ethnicity</span>
                  <span className="font-medium col-span-2">{user.ethnicity}</span>
                  <span className="text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" /> Disability</span>
                  <span className="font-medium col-span-2">{user.disabilityStatus}</span>
                </div>
              </div>

              <Separator className="my-3" />

              {/* Work Experience */}
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Work Experience</h4>
                {user.workExperience.map((exp, i) => (
                  <div key={i} className="mb-3">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold">{exp.title} - {exp.company}</span>
                      <span className="text-[10px] text-muted-foreground">{exp.startDate} - {exp.endDate} ({exp.yearsOfExperience}y)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{exp.description}</p>
                  </div>
                ))}
              </div>

              <Separator className="my-3" />

              {/* Education */}
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Education</h4>
                {user.education.map((edu, i) => (
                  <div key={i} className="mb-2">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold">{edu.degree} in {edu.course} - {edu.university}</span>
                      <span className="text-[10px] text-muted-foreground">{edu.startDate} - {edu.endDate}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">GPA: {edu.grade}</p>
                  </div>
                ))}
              </div>

              <Separator className="my-3" />

              {/* Projects */}
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Projects</h4>
                {user.projects.map((project, i) => (
                  <div key={i} className="mb-3">
                    <span className="text-xs font-semibold">{project.title}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">({project.skills.join(", ")})</span>
                    <ul className="ml-3 mt-0.5">
                      {project.bullets.map((b, j) => (
                        <li key={j} className="text-[11px] text-muted-foreground">- {b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <Separator className="my-3" />

              {/* Skills */}
              <div className="mb-4">
                <h4 className="text-xs font-bold uppercase tracking-wider mb-2">Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {user.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-[10px] bg-accent text-accent-foreground">{skill}</Badge>
                  ))}
                </div>
              </div>

              <Separator className="my-3" />

              {/* Application Stats */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Total Apps", value: user.totalApps },
                  { label: "Successful", value: user.successfulApps },
                  { label: "Failed", value: user.failedApps },
                  { label: "In Progress", value: user.inProgressApps },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg bg-accent/50 p-3 text-center">
                    <p className="text-lg font-bold">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Resume PDF */}
            <div className="rounded-lg border border-border p-5 bg-foreground/5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Resume
                </h4>
                <Button variant="outline" size="sm" className="text-xs gap-1.5 h-7">
                  <FileText className="h-3 w-3" /> Download PDF
                </Button>
              </div>
              <div className="text-center mb-4 pb-3 border-b border-border">
                <h4 className="text-base font-bold">{user.name}</h4>
                <p className="text-xs text-muted-foreground">{user.email} | {user.phone} | {user.location}</p>
                <p className="text-xs text-muted-foreground">{user.linkedinUrl}</p>
              </div>
              <div className="mb-3">
                <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Summary</h5>
                <p className="text-xs text-muted-foreground leading-relaxed">{user.resumeSummary}</p>
              </div>
              <div className="mb-3">
                <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Experience</h5>
                {user.workExperience.map((exp, i) => (
                  <div key={i} className="mb-2">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold">{exp.title} - {exp.company}</span>
                      <span className="text-[10px] text-muted-foreground">{exp.startDate} - {exp.endDate}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{exp.description}</p>
                  </div>
                ))}
              </div>
              <div className="mb-3">
                <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Education</h5>
                {user.education.map((edu, i) => (
                  <div key={i} className="mb-1">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold">{edu.degree} {edu.course} - {edu.university}</span>
                      <span className="text-[10px] text-muted-foreground">{edu.startDate} - {edu.endDate}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">GPA: {edu.grade}</p>
                  </div>
                ))}
              </div>
              <div className="mb-3">
                <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Projects</h5>
                {user.projects.map((project, i) => (
                  <div key={i} className="mb-2">
                    <span className="text-xs font-semibold">{project.title}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">({project.skills.join(", ")})</span>
                    <ul className="ml-3">
                      {project.bullets.map((b, j) => (
                        <li key={j} className="text-[11px] text-muted-foreground">- {b}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider mb-1">Skills</h5>
                <p className="text-xs text-muted-foreground">{user.skills.join(" | ")}</p>
              </div>
            </div>

            {/* Cover Letter */}
            <div className="rounded-lg border border-border p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Cover Letter
              </h4>
              <div className="rounded-lg bg-accent/30 p-4">
                {user.coverLetter.split('\n').map((line, i) => (
                  <p key={i} className={`text-sm leading-relaxed text-muted-foreground ${line === '' ? 'h-3' : ''}`}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-sm">User information not available</p>
            <div className="mt-3 text-xs">
              <p>Name: {app.userName}</p>
              <p>Email: {app.userEmail}</p>
              <p>Phone: {app.userPhone}</p>
              <p>Location: {app.userLocation}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

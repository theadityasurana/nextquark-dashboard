"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/status-badge"
import { ConfigureDialog } from "@/components/configure-dialog"
import { PerformanceDialog } from "@/components/performance-dialog"
import { AddAgentDialog } from "@/components/add-agent-dialog"
interface Agent {
  id: string
  status: string
  firstName: string
  lastName: string
  email: string
  phone: string
  location: string
  companyName: string
  jobTitle: string
  jobUrl: string
  resumeUrl: string
  createdAt: string
  duration: string
  skills?: string[]
  experience?: any
  education?: any
}

interface AgentStats {
  total: number
  active: number
  idle: number
  completed: number
  error: number
  successRate: string
  avgProcessingTime: string
}
import { Plus, Settings, BarChart3, Eye, Pause, Play, RotateCcw, ScrollText, Cpu, HardDrive, Wifi, Server } from "lucide-react"

export function AgentsScreen() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [stats, setStats] = useState<AgentStats>({
    total: 0,
    active: 0,
    idle: 0,
    completed: 0,
    error: 0,
    successRate: '0.0',
    avgProcessingTime: '0m'
  })
  const [loading, setLoading] = useState(true)
  const [configureOpen, setConfigureOpen] = useState(false)
  const [performanceOpen, setPerformanceOpen] = useState(false)
  const [addAgentOpen, setAddAgentOpen] = useState(false)

  const fetchAgents = async () => {
      try {
        const response = await fetch('/api/agents')
        const data = await response.json()
        if (data.agents) {
          setAgents(data.agents)
          setStats(data.stats)
        }
      } catch (error) {
        console.error('Failed to fetch agents:', error)
      } finally {
        setLoading(false)
      }
    }

  useEffect(() => {
    
    fetchAgents()
    const interval = setInterval(fetchAgents, 5000)
    return () => clearInterval(interval)
  }, [])

  const getStatusBadgeStatus = (status: string) => {
    if (status === 'processing') return 'active'
    if (status === 'pending') return 'idle'
    if (status === 'failed') return 'error'
    return 'idle'
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor and manage all AI browser agents</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setConfigureOpen(true)}>
            <Settings className="h-3 w-3" /> Configure
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setPerformanceOpen(true)}>
            <BarChart3 className="h-3 w-3" /> Performance
          </Button>
          <Button size="sm" className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setAddAgentOpen(true)}>
            <Plus className="h-3 w-3" /> Add Agent
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm">
        <span className="text-muted-foreground">Total: <span className="text-foreground font-semibold">{stats.total}</span></span>
        <span className="text-muted-foreground">Active: <span className="text-success font-semibold">{stats.active}</span></span>
        <span className="text-muted-foreground">Idle: <span className="text-warning font-semibold">{stats.idle}</span></span>
        <span className="text-muted-foreground">Completed: <span className="text-chart-2 font-semibold">{stats.completed}</span></span>
        <span className="text-muted-foreground">Error: <span className="text-destructive font-semibold">{stats.error}</span></span>
        <span className="text-muted-foreground">Success Rate: <span className="text-foreground font-semibold">{stats.successRate}%</span></span>
        <span className="text-muted-foreground">Avg Time: <span className="text-foreground font-semibold">{stats.avgProcessingTime}</span></span>
      </div>

      {/* Agent Cards */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No agents found</div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent) => (
          <Card
            key={agent.id}
            className={`bg-card border-border hover:border-primary/30 transition-colors cursor-pointer ${
              agent.status === "failed" ? "border-destructive/30" : ""
            }`}
            onClick={() => setSelectedAgent(agent)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold truncate max-w-[200px]" title={agent.id}>{agent.id.slice(0, 8)}...</span>
                  <StatusBadge status={getStatusBadgeStatus(agent.status)} />
                </div>
                <div className="flex items-center gap-1">
                  {agent.status === "processing" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setSelectedAgent(agent) }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {agent.status === "failed" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-primary">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="mb-3">
                <p className="text-sm">
                  <span className="text-muted-foreground">User: </span>
                  <span className="font-medium">{agent.firstName} {agent.lastName}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Job: </span>
                  <span className="font-medium">{agent.jobTitle}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{agent.companyName}</p>
              </div>

              {agent.status === "processing" && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">Processing...</span>
                    <span className="text-[11px] text-muted-foreground">{agent.duration}</span>
                  </div>
                  <Progress value={50} className="h-1.5" />
                </div>
              )}

              {agent.status === "pending" && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground">Waiting in queue for {agent.duration}</p>
                </div>
              )}

              {agent.status === "completed" && (
                <div className="mb-3">
                  <p className="text-xs text-success">✓ Application completed in {agent.duration}</p>
                </div>
              )}

              {agent.status === "failed" && (
                <div className="mb-3">
                  <p className="text-xs text-destructive">✗ Application failed after {agent.duration}</p>
                </div>
              )}

              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1" title={agent.location}><Server className="h-3 w-3" /> {agent.location.split(',')[0]}</span>
                <span className="flex items-center gap-1" title={agent.email}><Wifi className="h-3 w-3" /> {agent.email.split('@')[0]}</span>
                <span className="ml-auto">{new Date(agent.createdAt).toLocaleTimeString()}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      )}

      {/* Agent Detail / Live View Modal */}
      <Dialog open={!!selectedAgent} onOpenChange={() => setSelectedAgent(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card border-border">
          {selectedAgent && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg font-mono">{selectedAgent.id}</DialogTitle>
                  <StatusBadge status={getStatusBadgeStatus(selectedAgent.status)} />
                </div>
              </DialogHeader>

              <div className="flex flex-col gap-5 mt-2">
                {/* Live View Placeholder */}
                {selectedAgent.status === "processing" && (
                  <div className="rounded-lg border border-border bg-background overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-accent/50 border-b border-border">
                      <div className="flex gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
                        <span className="h-2.5 w-2.5 rounded-full bg-warning" />
                        <span className="h-2.5 w-2.5 rounded-full bg-success" />
                      </div>
                      <span className="text-[11px] text-muted-foreground ml-2">Live Browser View - {selectedAgent.currentJob}</span>
                    </div>
                    <div className="p-6 flex flex-col items-center justify-center h-48 text-muted-foreground">
                      <Monitor className="h-10 w-10 mb-2 text-primary/30" />
                      <p className="text-sm">Live Application View</p>
                      <p className="text-xs text-muted-foreground mt-1">Processing: {selectedAgent.jobTitle} at {selectedAgent.companyName}</p>
                      <p className="text-xs text-muted-foreground">User: {selectedAgent.firstName} {selectedAgent.lastName}</p>
                    </div>
                  </div>
                )}

                {/* Agent Details */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Application Details</h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">User</span>
                    <span className="font-medium">{selectedAgent.firstName} {selectedAgent.lastName}</span>
                    <span className="text-muted-foreground">Email</span>
                    <span className="text-xs">{selectedAgent.email}</span>
                    <span className="text-muted-foreground">Phone</span>
                    <span className="text-xs">{selectedAgent.phone}</span>
                    <span className="text-muted-foreground">Location</span>
                    <span className="text-xs">{selectedAgent.location}</span>
                    <span className="text-muted-foreground">Company</span>
                    <span className="font-medium">{selectedAgent.companyName}</span>
                    <span className="text-muted-foreground">Job Title</span>
                    <span className="font-medium">{selectedAgent.jobTitle}</span>
                    <span className="text-muted-foreground">Job URL</span>
                    <a href={selectedAgent.jobUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate">{selectedAgent.jobUrl}</a>
                    <span className="text-muted-foreground">Resume</span>
                    <a href={selectedAgent.resumeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">View Resume</a>
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium">{selectedAgent.duration}</span>
                    <span className="text-muted-foreground">Created</span>
                    <span className="text-xs">{new Date(selectedAgent.createdAt).toLocaleString()}</span>
                  </div>
                </div>

                {/* Skills */}
                {selectedAgent.skills && selectedAgent.skills.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedAgent.skills.slice(0, 10).map((skill, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Simulated Logs */}
                {selectedAgent.status === "processing" && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Real-time Logs</h3>
                    <div className="rounded-lg border border-border bg-background p-3 font-mono text-xs flex flex-col gap-1">
                      <span><span className="text-muted-foreground">10:47:42</span> <span className="text-success">INFO</span> Clicking Next button...</span>
                      <span><span className="text-muted-foreground">10:47:40</span> <span className="text-success">INFO</span> Selecting location field</span>
                      <span><span className="text-muted-foreground">10:47:38</span> <span className="text-success">INFO</span> Entering phone number</span>
                      <span><span className="text-muted-foreground">10:47:35</span> <span className="text-success">INFO</span> Entering email address</span>
                      <span><span className="text-muted-foreground">10:47:33</span> <span className="text-success">INFO</span> Entering name field</span>
                    </div>
                  </div>
                )}

                {/* Controls */}
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  {selectedAgent.status === "processing" && (
                    <>
                      <Button size="sm" variant="outline" className="text-xs gap-1.5">
                        <Pause className="h-3 w-3" /> Pause
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs gap-1.5">
                        <RotateCcw className="h-3 w-3" /> Restart
                      </Button>
                    </>
                  )}
                  {selectedAgent.status === "pending" && (
                    <Button size="sm" variant="outline" className="text-xs gap-1.5">
                      <Play className="h-3 w-3" /> Start Processing
                    </Button>
                  )}
                  {selectedAgent.status === "failed" && (
                    <Button size="sm" className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                      <RotateCcw className="h-3 w-3" /> Retry Application
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-xs gap-1.5 ml-auto">
                    <ScrollText className="h-3 w-3" /> View Logs
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <ConfigureDialog open={configureOpen} onOpenChange={setConfigureOpen} />
      <PerformanceDialog open={performanceOpen} onOpenChange={setPerformanceOpen} />
      <AddAgentDialog open={addAgentOpen} onOpenChange={setAddAgentOpen} onAgentAdded={fetchAgents} />
    </div>
  )
}

function Monitor(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  )
}

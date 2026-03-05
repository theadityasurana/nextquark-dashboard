"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/status-badge"
import { mockAgents, type Agent } from "@/lib/mock-data"
import { Plus, Settings, BarChart3, Eye, Pause, Play, RotateCcw, ScrollText, Cpu, HardDrive, Wifi, Server } from "lucide-react"

export function AgentsScreen() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const activeCount = mockAgents.filter((a) => a.status === "active").length
  const idleCount = mockAgents.filter((a) => a.status === "idle").length
  const errorCount = mockAgents.filter((a) => a.status === "error").length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">Monitor and manage all AI browser agents</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
            <Settings className="h-3 w-3" /> Configure
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
            <BarChart3 className="h-3 w-3" /> Performance
          </Button>
          <Button size="sm" className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3 w-3" /> Add Agent
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm">
        <span className="text-muted-foreground">Total: <span className="text-foreground font-semibold">{mockAgents.length}</span></span>
        <span className="text-muted-foreground">Active: <span className="text-success font-semibold">{activeCount}</span></span>
        <span className="text-muted-foreground">Idle: <span className="text-warning font-semibold">{idleCount}</span></span>
        <span className="text-muted-foreground">Error: <span className="text-destructive font-semibold">{errorCount}</span></span>
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mockAgents.map((agent) => (
          <Card
            key={agent.id}
            className={`bg-card border-border hover:border-primary/30 transition-colors cursor-pointer ${
              agent.status === "error" ? "border-destructive/30" : ""
            }`}
            onClick={() => setSelectedAgent(agent)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold">{agent.id}</span>
                  <StatusBadge status={agent.status} />
                </div>
                <div className="flex items-center gap-1">
                  {agent.status === "active" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setSelectedAgent(agent) }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {agent.status === "error" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-primary">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {agent.status === "active" && (
                <>
                  <div className="mb-2">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Current: </span>
                      <span className="font-medium">{agent.currentJob}</span>
                      <span className="text-muted-foreground"> ({agent.currentUser})</span>
                    </p>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">Step {agent.progressStep}/{agent.totalSteps}</span>
                    <span className="text-[11px] text-muted-foreground">{Math.round((agent.progressStep / agent.totalSteps) * 100)}%</span>
                  </div>
                  <Progress value={(agent.progressStep / agent.totalSteps) * 100} className="h-1.5 mb-3" />
                </>
              )}

              {agent.status === "idle" && (
                <div className="mb-3">
                  <p className="text-sm text-muted-foreground">
                    Last: <span className="text-foreground">{agent.lastJob}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Idle for {agent.idleTime}</p>
                </div>
              )}

              {agent.status === "error" && (
                <div className="mb-3">
                  <p className="text-sm text-muted-foreground">
                    Failed: <span className="text-foreground">{agent.lastJob}</span>
                  </p>
                  <p className="text-xs text-destructive mt-1">{agent.lastError}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Retries: {agent.retryCount}/{agent.maxRetries} exhausted</p>
                </div>
              )}

              {/* Resource Usage */}
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Cpu className="h-3 w-3" /> {agent.cpu}%</span>
                <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> {agent.ram}</span>
                <span className="flex items-center gap-1"><Wifi className="h-3 w-3" /> {agent.network}</span>
                {agent.status === "active" && <span className="ml-auto">{agent.runtime}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Agent Detail / Live View Modal */}
      <Dialog open={!!selectedAgent} onOpenChange={() => setSelectedAgent(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card border-border">
          {selectedAgent && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-lg font-mono">{selectedAgent.id}</DialogTitle>
                  <StatusBadge status={selectedAgent.status} />
                </div>
              </DialogHeader>

              <div className="flex flex-col gap-5 mt-2">
                {/* Live View Placeholder */}
                {selectedAgent.status === "active" && (
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
                      <p className="text-sm">VNC Stream Preview</p>
                      <p className="text-xs text-muted-foreground mt-1">Currently processing: {selectedAgent.currentJob} ({selectedAgent.currentUser})</p>
                    </div>
                  </div>
                )}

                {/* Agent Details */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Agent Details</h3>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Server</span>
                    <span className="font-mono text-xs">{selectedAgent.server}</span>
                    <span className="text-muted-foreground">Browser</span>
                    <span className="font-mono text-xs">{selectedAgent.browser}</span>
                    <span className="text-muted-foreground">CPU Usage</span>
                    <span className="font-medium">{selectedAgent.cpu}%</span>
                    <span className="text-muted-foreground">Memory</span>
                    <span className="font-medium">{selectedAgent.ram}</span>
                    <span className="text-muted-foreground">Network</span>
                    <span className="font-medium">{selectedAgent.network}</span>
                  </div>
                </div>

                {/* Simulated Logs */}
                {selectedAgent.status === "active" && (
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
                  {selectedAgent.status === "active" && (
                    <>
                      <Button size="sm" variant="outline" className="text-xs gap-1.5">
                        <Pause className="h-3 w-3" /> Pause
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs gap-1.5">
                        <RotateCcw className="h-3 w-3" /> Restart
                      </Button>
                    </>
                  )}
                  {selectedAgent.status === "idle" && (
                    <Button size="sm" variant="outline" className="text-xs gap-1.5">
                      <Play className="h-3 w-3" /> Assign Job
                    </Button>
                  )}
                  {selectedAgent.status === "error" && (
                    <Button size="sm" className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
                      <RotateCcw className="h-3 w-3" /> Restart Agent
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-xs gap-1.5 ml-auto">
                    <ScrollText className="h-3 w-3" /> Full Logs
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
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

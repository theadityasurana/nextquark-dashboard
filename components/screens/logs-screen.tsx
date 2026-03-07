"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLogs } from "@/lib/logs-context"
import { Search, Download, X } from "lucide-react"
import { cn } from "@/lib/utils"

const levelColors: Record<string, string> = {
  info: "text-chart-2",
  warn: "text-warning",
  error: "text-destructive",
}

const levelBg: Record<string, string> = {
  info: "bg-chart-2/10",
  warn: "bg-warning/10",
  error: "bg-destructive/10",
}

export function LogsScreen() {
  const { logs, agentDetailsMap } = useLogs()
  const [searchQuery, setSearchQuery] = useState("")
  const [levelFilter, setLevelFilter] = useState("all")
  const [agentFilter, setAgentFilter] = useState("all")

  const uniqueAgents = Array.from(new Set(logs.map((l) => l.agentId)))

  const getAgentDisplayName = (agentId: string) => {
    const details = agentDetailsMap[agentId]
    if (details) {
      return `${details.firstName} ${details.lastName} - ${details.jobTitle} at ${details.companyName}`
    }
    return agentId
  }

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== "all" && log.level !== levelFilter) return false
    if (agentFilter !== "all" && log.agentId !== agentFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return log.message.toLowerCase().includes(q) || log.agentId.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">View all system logs for debugging</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search logs..." className="pl-9 bg-card border-border" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-[140px] bg-card border-border text-sm">
            <SelectValue placeholder="All Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[280px] bg-card border-border text-sm">
            <SelectValue placeholder="All Agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {uniqueAgents.map((agent) => (
              <SelectItem key={agent} value={agent}>{getAgentDisplayName(agent)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs">
            <Download className="h-3 w-3" /> Download
          </Button>
          {(levelFilter !== "all" || agentFilter !== "all" || searchQuery) && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => { setLevelFilter("all"); setAgentFilter("all"); setSearchQuery("") }}>
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
        </div>
      </div>

      {/* Logs */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="hidden md:grid grid-cols-[80px_70px_200px_1fr] gap-4 px-4 py-3 border-b border-border text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <span>Time</span>
            <span>Level</span>
            <span>Agent</span>
            <span>Message</span>
          </div>
          <div className="divide-y divide-border font-mono text-sm">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "grid grid-cols-1 md:grid-cols-[80px_70px_200px_1fr] gap-1 md:gap-4 px-4 py-2.5 hover:bg-accent/50 transition-colors items-center",
                  log.level === "error" && "bg-destructive/5"
                )}
              >
                <span className="text-xs text-muted-foreground">{log.timestamp}</span>
                <span className={cn("text-[11px] font-semibold uppercase px-1.5 py-0.5 rounded w-fit", levelColors[log.level], levelBg[log.level])}>
                  {log.level}
                </span>
                <span className="text-xs text-muted-foreground truncate" title={getAgentDisplayName(log.agentId)}>{getAgentDisplayName(log.agentId)}</span>
                <span className="text-xs text-foreground">{log.message}</span>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <span className="text-xs text-muted-foreground">Showing {filteredLogs.length} of {logs.length} entries</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="text-xs h-7" disabled>Previous</Button>
              <span className="text-xs text-muted-foreground">Page 1 of 1</span>
              <Button size="sm" variant="outline" className="text-xs h-7" disabled>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

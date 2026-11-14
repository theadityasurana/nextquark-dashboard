"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { PageHeader, Panel, MiniStat, Toolbar, SearchField, TableHead, TableSkeleton, EmptyState } from "@/components/ui/dashboard"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLogs } from "@/lib/logs-context"
import { Download, X, RefreshCw, Trash2, ScrollText } from "lucide-react"
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
  const { logs, agentDetailsMap, refreshLogs, clearLogs } = useLogs()
  const [loadingLogs, setLoadingLogs] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  useEffect(() => { refreshLogs().finally(() => setLoadingLogs(false)) }, [refreshLogs])

  const handleClearAll = async () => {
    setClearing(true)
    try {
      const res = await fetch("/api/logs", { method: "DELETE" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      clearLogs()
      toast.success(`Cleared ${Number(body.removed || 0).toLocaleString()} log lines`)
    } catch (e) {
      toast.error(`Couldn't clear logs: ${e instanceof Error ? e.message : "unknown error"}`)
      await refreshLogs()
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }
  const [searchQuery, setSearchQuery] = useState("")
  const [levelFilter, setLevelFilter] = useState("all")
  const [agentFilter, setAgentFilter] = useState("all")
  const [refreshing, setRefreshing] = useState(false)
  const [visibleCount, setVisibleCount] = useState(50)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshLogs()
    setVisibleCount(50)
    setRefreshing(false)
  }

  const uniqueAgents = Array.from(new Set(logs.map((l) => l.agentId)))

  const getAgentDisplayName = (agentId: string) => {
    const details = agentDetailsMap[agentId]
    if (details) {
      return `${details.firstName} ${details.lastName} - ${details.jobTitle} at ${details.companyName}`
    }
    return agentId
  }

  const PAGE_SIZE = 25

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== "all" && log.level !== levelFilter) return false
    if (agentFilter !== "all" && log.agentId !== agentFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return log.message.toLowerCase().includes(q) || log.agentId.toLowerCase().includes(q)
    }
    return true
  })

  const visibleLogs = filteredLogs.slice(0, visibleCount)

  const handleDownload = () => {
    const rows = [
      ["Time", "Level", "Agent", "Message"],
      ...filteredLogs.map((log) => [
        log.timestamp,
        log.level,
        getAgentDisplayName(log.agentId),
        `"${log.message.replace(/"/g, '""')}"`
      ])
    ]
    const csv = rows.map((r) => r.join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `system-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const errorCount = logs.filter((l) => l.level === "error").length
  const warnCount = logs.filter((l) => l.level === "warn").length

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="System logs"
        description="The latest 500 log lines from every run, newest first."
        actions={
          <>
            <Button size="sm" variant="outline" className="gap-2" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" variant="outline" className="gap-2" onClick={handleDownload} disabled={!filteredLogs.length}>
              <Download className="h-3.5 w-3.5" /> Download
            </Button>
            <Button size="sm" variant="outline" className="gap-2 text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)} disabled={clearing}>
              <Trash2 className="h-3.5 w-3.5" /> {clearing ? "Clearing…" : "Clear all logs"}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <MiniStat label="Loaded" value={logs.length} hint="most recent lines" />
        <MiniStat label="Warnings" value={warnCount} dot="bg-warning" onClick={() => setLevelFilter("warn")} active={levelFilter === "warn"} />
        <MiniStat label="Errors" value={errorCount} dot="bg-destructive" onClick={() => setLevelFilter("error")} active={levelFilter === "error"} />
      </div>

      <Panel>
        <Toolbar className="border-b border-border px-5 py-3">
          <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search messages…" />
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger size="sm" className="h-9 w-full text-xs sm:w-36"><SelectValue placeholder="All levels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger size="sm" className="h-9 w-full text-xs sm:w-72"><SelectValue placeholder="All runs" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All runs</SelectItem>
              {uniqueAgents.map((agent) => (
                <SelectItem key={agent} value={agent}>{getAgentDisplayName(agent)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(levelFilter !== "all" || agentFilter !== "all" || searchQuery) && (
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={() => { setLevelFilter("all"); setAgentFilter("all"); setSearchQuery(""); setVisibleCount(PAGE_SIZE) }}>
              <X className="h-3 w-3" /> Reset
            </Button>
          )}
        </Toolbar>

        <TableHead className="hidden md:flex" columns={[
          { label: "Time", className: "w-20 shrink-0" },
          { label: "Level", className: "w-16 shrink-0" },
          { label: "Run", className: "w-56 shrink-0" },
          { label: "Message", className: "flex-1" },
        ]} />

        {loadingLogs && logs.length === 0 ? (
          <TableSkeleton rows={10} />
        ) : visibleLogs.length === 0 ? (
          <EmptyState icon={ScrollText} title={logs.length ? "No logs match these filters" : "No logs"} description={logs.length ? undefined : "New runs will write their logs here."} />
        ) : (
          <div className="divide-y divide-border">
            {visibleLogs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "flex flex-col gap-1 px-5 py-2.5 transition-colors hover:bg-muted/40 md:flex-row md:items-start md:gap-4",
                  log.level === "error" && "bg-destructive/5",
                )}
              >
                <span className="w-20 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{log.timestamp}</span>
                <span className={cn("w-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase md:w-16 md:text-center", levelColors[log.level], levelBg[log.level])}>
                  {log.level}
                </span>
                <span className="w-56 shrink-0 truncate text-xs text-muted-foreground" title={getAgentDisplayName(log.agentId)}>{getAgentDisplayName(log.agentId)}</span>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => { const n = new Set(prev); if (n.has(log.id)) n.delete(log.id); else n.add(log.id); return n })}
                  className={cn("min-w-0 flex-1 cursor-text select-text break-all text-left font-mono text-xs", !expanded.has(log.id) && "line-clamp-4")}
                  title={expanded.has(log.id) ? undefined : "Click to expand"}
                >
                  {log.message}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-xs tabular-nums text-muted-foreground">Showing {visibleLogs.length} of {filteredLogs.length}</span>
          {visibleCount < filteredLogs.length && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setVisibleCount((c) => c + PAGE_SIZE * 2)}>
              Load more
            </Button>
          )}
        </div>
      </Panel>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogTitle>Clear all logs?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes every row in application_logs. Run timelines in application details and the
            Learning page&apos;s failure analysis are built from these logs, so they will be empty for past runs.
            This cannot be undone.
          </AlertDialogDescription>
          <div className="flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete all logs</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

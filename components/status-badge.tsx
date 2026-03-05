import { cn } from "@/lib/utils"

type StatusType = "queued" | "processing" | "completed" | "failed" | "active" | "idle" | "error" | "slow" | "down" | "paused" | "closed"

const statusConfig: Record<StatusType, { label: string; dotColor: string; bgColor: string; textColor: string }> = {
  queued: { label: "Queued", dotColor: "bg-warning", bgColor: "bg-warning/10", textColor: "text-warning" },
  processing: { label: "Processing", dotColor: "bg-chart-2", bgColor: "bg-chart-2/10", textColor: "text-chart-2" },
  completed: { label: "Completed", dotColor: "bg-success", bgColor: "bg-success/10", textColor: "text-success" },
  failed: { label: "Failed", dotColor: "bg-destructive", bgColor: "bg-destructive/10", textColor: "text-destructive" },
  active: { label: "Active", dotColor: "bg-success", bgColor: "bg-success/10", textColor: "text-success" },
  idle: { label: "Idle", dotColor: "bg-warning", bgColor: "bg-warning/10", textColor: "text-warning" },
  error: { label: "Error", dotColor: "bg-destructive", bgColor: "bg-destructive/10", textColor: "text-destructive" },
  slow: { label: "Slow", dotColor: "bg-warning", bgColor: "bg-warning/10", textColor: "text-warning" },
  down: { label: "Down", dotColor: "bg-destructive", bgColor: "bg-destructive/10", textColor: "text-destructive" },
  paused: { label: "Paused", dotColor: "bg-muted-foreground", bgColor: "bg-muted/50", textColor: "text-muted-foreground" },
  closed: { label: "Closed", dotColor: "bg-muted-foreground", bgColor: "bg-muted/50", textColor: "text-muted-foreground" },
}

export function StatusBadge({ status, className }: { status: StatusType; className?: string }) {
  const config = statusConfig[status]
  if (!config) return null

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", config.bgColor, config.textColor, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dotColor)} />
      {config.label}
    </span>
  )
}

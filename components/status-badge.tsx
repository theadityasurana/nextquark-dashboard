import { cn } from "@/lib/utils"

export type StatusType = "queued" | "processing" | "completed" | "failed" | "active" | "idle" | "error" | "slow" | "down" | "paused" | "closed" | "awaiting_otp" | "awaiting_captcha" | "pending" | "blocked"

const statusConfig: Record<StatusType, { label: string; dotColor: string; bgColor: string; textColor: string; borderColor: string; pulse?: boolean }> = {
  queued:           { label: "Queued",           dotColor: "bg-warning",          bgColor: "bg-warning/10",       textColor: "text-warning",          borderColor: "border-warning/20" },
  pending:          { label: "Pending",          dotColor: "bg-warning",          bgColor: "bg-warning/10",       textColor: "text-warning",          borderColor: "border-warning/20" },
  processing:       { label: "Processing",       dotColor: "bg-chart-2",          bgColor: "bg-chart-2/10",       textColor: "text-chart-2",          borderColor: "border-chart-2/20", pulse: true },
  completed:        { label: "Completed",        dotColor: "bg-success",          bgColor: "bg-success/10",       textColor: "text-success",          borderColor: "border-success/20" },
  failed:           { label: "Failed",           dotColor: "bg-destructive",      bgColor: "bg-destructive/10",   textColor: "text-destructive",      borderColor: "border-destructive/20" },
  awaiting_otp:     { label: "Awaiting OTP",     dotColor: "bg-orange-500",       bgColor: "bg-orange-500/10",    textColor: "text-orange-500",       borderColor: "border-orange-500/20", pulse: true },
  awaiting_captcha: { label: "CAPTCHA Required", dotColor: "bg-red-500",          bgColor: "bg-red-500/10",       textColor: "text-red-500",          borderColor: "border-red-500/20", pulse: true },
  // Refused by the pre-flight gate — never dispatched, so it reads as inert
  // rather than alarming: nothing broke, we chose not to spend the session.
  blocked:          { label: "Won't Apply",      dotColor: "bg-muted-foreground", bgColor: "bg-muted/40",         textColor: "text-muted-foreground", borderColor: "border-border" },
  active:           { label: "Active",           dotColor: "bg-success",          bgColor: "bg-success/10",       textColor: "text-success",          borderColor: "border-success/20", pulse: true },
  idle:             { label: "Idle",             dotColor: "bg-warning",          bgColor: "bg-warning/10",       textColor: "text-warning",          borderColor: "border-warning/20" },
  error:            { label: "Error",            dotColor: "bg-destructive",      bgColor: "bg-destructive/10",   textColor: "text-destructive",      borderColor: "border-destructive/20" },
  slow:             { label: "Slow",             dotColor: "bg-warning",          bgColor: "bg-warning/10",       textColor: "text-warning",          borderColor: "border-warning/20" },
  down:             { label: "Down",             dotColor: "bg-destructive",      bgColor: "bg-destructive/10",   textColor: "text-destructive",      borderColor: "border-destructive/20" },
  paused:           { label: "Paused",           dotColor: "bg-muted-foreground", bgColor: "bg-muted/40",         textColor: "text-muted-foreground", borderColor: "border-border" },
  closed:           { label: "Closed",           dotColor: "bg-muted-foreground", bgColor: "bg-muted/40",         textColor: "text-muted-foreground", borderColor: "border-border" },
}

export function StatusBadge({ status, className }: { status: StatusType; className?: string }) {
  const config = statusConfig[status]
  if (!config) return null

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
      config.bgColor,
      config.textColor,
      config.borderColor,
      className
    )}>
      <span className="relative flex h-1.5 w-1.5">
        {config.pulse && (
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-60", config.dotColor)} />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", config.dotColor)} />
      </span>
      {config.label}
    </span>
  )
}

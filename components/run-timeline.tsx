"use client"

/**
 * Renders a run's structured timeline — the "what actually happened" view that
 * replaces reading the flat log stream to find out where a run died.
 *
 * Each step shows its verdict, how long it took, a one-line detail, and any
 * screenshots captured while it was the active step. The failed step is expanded
 * by default and carries the form's own validation messages when it has them,
 * because that is what an operator is opening this panel to see.
 */

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import type { RunStep, RunTimeline as RunTimelineDoc } from "@/lib/run-timeline"
import { summarize } from "@/lib/run-timeline"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Loader2,
  MinusCircle,
  Receipt,
  X,
} from "lucide-react"

/** Human-readable duration: sub-second stays in ms, past a minute reads as m/s. */
function formatDuration(ms: number | null): string | null {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

const STATUS_STYLES: Record<
  RunStep["status"],
  { icon: typeof Check; ring: string; text: string; label: string }
> = {
  success: {
    icon: Check,
    ring: "border-green-500/40 bg-green-500/10 text-green-600",
    text: "text-foreground",
    label: "ok",
  },
  failed: {
    icon: X,
    ring: "border-destructive/40 bg-destructive/10 text-destructive",
    text: "text-destructive",
    label: "failed",
  },
  running: {
    icon: Loader2,
    ring: "border-primary/40 bg-primary/10 text-primary",
    text: "text-foreground",
    label: "running",
  },
  skipped: {
    icon: MinusCircle,
    ring: "border-border bg-muted text-muted-foreground",
    text: "text-muted-foreground",
    label: "skipped",
  },
  pending: {
    icon: CircleDashed,
    ring: "border-border bg-transparent text-muted-foreground/50",
    text: "text-muted-foreground/60",
    label: "pending",
  },
}

function StepRow({
  step,
  isLast,
  defaultOpen,
}: {
  step: RunStep
  isLast: boolean
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const style = STATUS_STYLES[step.status]
  const Icon = style.icon
  const duration = formatDuration(step.durationMs)
  // Only rows with something more to show are worth making interactive.
  const expandable = step.screenshots.length > 0 || !!step.error

  return (
    <div className="flex gap-3">
      {/* Rail: status dot + connector to the next step. */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${style.ring}`}
        >
          <Icon className={`h-3 w-3 ${step.status === "running" ? "animate-spin" : ""}`} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border" style={{ minHeight: 12 }} />}
      </div>

      <div className="flex-1 pb-4 min-w-0">
        <button
          type="button"
          onClick={() => expandable && setOpen((o) => !o)}
          className={`flex w-full items-center gap-2 text-left ${expandable ? "cursor-pointer" : "cursor-default"}`}
          aria-expanded={expandable ? open : undefined}
        >
          <span className={`text-xs font-medium ${style.text}`}>{step.label}</span>

          {duration && (
            <span className="text-[10px] tabular-nums text-muted-foreground">{duration}</span>
          )}

          {step.status === "failed" && (
            <Badge variant="destructive" className="h-4 text-[9px]">
              failed
            </Badge>
          )}
          {step.status === "skipped" && (
            <Badge variant="outline" className="h-4 text-[9px] text-muted-foreground">
              skipped
            </Badge>
          )}

          {step.screenshots.length > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {step.screenshots.length} shot{step.screenshots.length === 1 ? "" : "s"}
            </span>
          )}

          {expandable &&
            (open ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            ))}
        </button>

        {step.detail && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground break-words">
            {step.detail}
          </p>
        )}

        {step.error && open && (
          <p className="mt-1.5 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[11px] leading-relaxed text-destructive break-words">
            {step.error}
          </p>
        )}

        {open && step.screenshots.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {step.screenshots.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded border border-border transition-colors hover:border-primary/50"
                title="Open full size"
              >
                {/* Raw <img>: these are runtime Supabase storage URLs, not build-time assets. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${step.label} screenshot`}
                  loading="lazy"
                  className="h-20 w-32 object-cover object-top"
                />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function RunTimeline({
  timeline,
  confirmationId,
  confirmationLabel,
}: {
  timeline: RunTimelineDoc | null | undefined
  confirmationId?: string | null
  confirmationLabel?: string | null
}) {
  if (!timeline?.steps?.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-xs text-muted-foreground">
          No run timeline recorded. This application either hasn&apos;t been run yet, or ran before
          run telemetry was enabled.
        </p>
      </div>
    )
  }

  const s = summarize(timeline)
  const total = formatDuration(s.totalMs)
  // Pending tail steps are noise on a run that ended early — show them only while
  // the run is still open, so a finished run reads as exactly what it did.
  const visible = timeline.endedAt
    ? timeline.steps.filter((x) => x.status !== "pending")
    : timeline.steps

  return (
    <div className="flex flex-col gap-4">
      {/* Receipt — the strongest proof we have that this actually landed. */}
      {confirmationId && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5 shrink-0 text-green-600" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-green-600">
              {confirmationLabel || "Confirmation"}
            </span>
          </div>
          <p className="mt-1 font-mono text-sm font-semibold break-all">{confirmationId}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Captured from the confirmation page — quote this to the employer if the application is
            ever disputed.
          </p>
        </div>
      )}

      {/* Validation errors the form itself reported. */}
      {timeline.validationErrors.length > 0 && (
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-600" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600">
              The form rejected these fields
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {timeline.validationErrors.map((err, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-muted-foreground">
                • {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Roll-up */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          {s.completed}/{s.attempted} steps ok
        </Badge>
        {s.failed > 0 && (
          <Badge variant="destructive" className="text-[10px]">
            {s.failed} failed
          </Badge>
        )}
        {s.skipped > 0 && (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {s.skipped} skipped
          </Badge>
        )}
        {total && (
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {total} total
          </Badge>
        )}
        {!timeline.endedAt && (
          <Badge variant="secondary" className="text-[10px]">
            running
          </Badge>
        )}
      </div>

      {/* Steps */}
      <div className="flex flex-col">
        {visible.map((step, i) => (
          <StepRow
            key={step.id}
            step={step}
            isLast={i === visible.length - 1}
            // The failure is what the operator came here for — open it up front.
            defaultOpen={step.id === timeline.failedStep}
          />
        ))}
      </div>
    </div>
  )
}

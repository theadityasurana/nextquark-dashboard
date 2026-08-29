"use client"

/**
 * Pre-flight screening results for one application — why it was blocked, or what
 * the operator should know before it runs.
 *
 * Deliberately distinguishes the three verdicts, because they call for different
 * actions: a `fail` is terminal and the application should be dropped, a `warn`
 * is worth an eyeball but dispatch proceeds, and a missing blocking field is
 * fixable in the candidate's profile and should be re-queued afterwards.
 */

import { Badge } from "@/components/ui/badge"
import type { Knockout } from "@/lib/knockouts"
import { CircleCheck, CircleSlash, ShieldQuestion, TriangleAlert } from "lucide-react"

const STATUS: Record<
  Knockout["status"],
  { icon: typeof CircleCheck; cls: string; label: string }
> = {
  pass: { icon: CircleCheck, cls: "text-green-600", label: "pass" },
  warn: { icon: TriangleAlert, cls: "text-orange-500", label: "warn" },
  fail: { icon: CircleSlash, cls: "text-destructive", label: "blocked" },
}

function CoverageBar({ percent }: { percent: number }) {
  const tone =
    percent >= 90 ? "bg-green-500" : percent >= 70 ? "bg-orange-500" : "bg-destructive"
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

export function PreflightPanel({
  checks,
  blocked,
  blockReason,
  coveragePercent,
  blockingMissing,
  portalName,
  portalConfidence,
  screenedAt,
}: {
  checks?: Knockout[] | null
  blocked?: boolean | null
  blockReason?: string | null
  coveragePercent?: number | null
  blockingMissing?: string[] | null
  portalName?: string | null
  portalConfidence?: number | null
  screenedAt?: string | null
}) {
  if (!screenedAt) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-xs text-muted-foreground">
          Not screened yet. Pre-flight checks run when this application is dispatched.
        </p>
      </div>
    )
  }

  const missing = blockingMissing ?? []

  return (
    <div className="flex flex-col gap-4">
      {/* The verdict, when it blocks. */}
      {blocked && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="mb-1 flex items-center gap-2">
            <CircleSlash className="h-3.5 w-3.5 shrink-0 text-destructive" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
              Won&apos;t apply
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{blockReason}</p>
        </div>
      )}

      {/* Fillability — percent is context, the blocking list is the action. */}
      {coveragePercent != null && (
        <div className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Form coverage
            </span>
            <span className="text-xs font-semibold tabular-nums">{coveragePercent}%</span>
          </div>
          <CoverageBar percent={coveragePercent} />
          {missing.length > 0 ? (
            <p className="mt-2 text-[11px] leading-relaxed text-destructive">
              Missing required: {missing.join(", ")} — the run would stall before Submit. Fix the
              candidate&apos;s profile and re-queue.
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Every required field is available; this profile can reach Submit.
            </p>
          )}
        </div>
      )}

      {/* Portal detection confidence. */}
      {portalName && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {portalName}
          </Badge>
          {portalConfidence != null && (
            <Badge
              variant="outline"
              className={`text-[10px] ${portalConfidence >= 70 ? "text-green-600 border-green-500/30" : "text-orange-500 border-orange-500/30"}`}
            >
              {portalConfidence}% confidence
            </Badge>
          )}
        </div>
      )}

      {/* Individual knockout checks. */}
      {checks && checks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Screening checks
          </span>
          {checks.map((c) => {
            const { icon: Icon, cls } = STATUS[c.status]
            return (
              <div key={c.key} className="flex items-start gap-2">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cls}`} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium">{c.label}</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground break-words">
                    {c.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-muted-foreground">
          <ShieldQuestion className="h-3.5 w-3.5 shrink-0" />
          <p className="text-[11px]">
            No knockout checks applied — the linked job record had no work-authorization, seniority,
            or location data to screen against.
          </p>
        </div>
      )}
    </div>
  )
}

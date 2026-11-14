"use client"

import { useApi } from "@/lib/api-cache"
import { PageHeader, Panel, PanelHeader, Section, MiniStat } from "@/components/ui/dashboard"
import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Brain, CheckCircle2, XCircle, Archive, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface SkillVersion {
  id: string
  domain: string
  content: string
  version: number
  score: number
  status: string
  times_used: number
  created_at: string
}
interface DomainGroup {
  domain: string
  versions: SkillVersion[]
  active: number
  retired: number
  bestScore: number
  totalUses: number
}
interface LearningData {
  domains: DomainGroup[]
  answerStats: {
    total: number
    byState: Record<string, number>
    reusedTotal: number
    topReused: Array<{ question: string; answer: string; timesUsed: number; state: string; scope: string; isSensitive: boolean }>
  }
  outcomes: Array<{ domain: string; attempts: number; submitted: number; successRate: number; avgSeconds: number | null; topReason: string | null }>
  recentRuns: Array<{ company: string; domain: string | null; submitted: boolean; seconds: number | null; reason: string | null; confirmationId: string | null; at: string }>
  unavailable: Record<string, string> | null
  health?: {
    runs: number
    results: Record<string, number>
    fieldFailures: Array<{ field: string; reason: string; applications: number }>
    rejections: Array<{ reason: string; applications: number }>
    lastResort: Array<{ field: string; applications: number }>
    refills: { runsMeasured: number; runsWithRefills: number; extraWrites: number }
    queue: Record<string, number>
    removedReasons: Record<string, number>
  }
}

function Ranked({ title, rows, empty }: { title: string; rows: Array<{ label: string; detail?: string; count: number }>; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <Panel>
      <PanelHeader title={title} description={rows.length ? `${rows.length} distinct` : undefined} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-col gap-3 px-5 py-4">
          {rows.map((r) => (
            <div key={`${r.label}-${r.detail ?? ""}`} className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3 text-[13px]">
                <span className="min-w-0 break-words">
                  {r.label}
                  {r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}
                </span>
                <span className="num shrink-0 font-medium">{r.count}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <MiniStat label={label} value={value} hint={hint} />
}

export function LearningScreen() {
  const { data, error: loadError, isLoading: loading, refresh: load } = useApi<LearningData>("/api/learning")
  const error = loadError?.message ?? null

  const totalSkills = data?.domains.reduce((n, d) => n + d.versions.length, 0) ?? 0
  const retiredSkills = data?.domains.reduce((n, d) => n + d.retired, 0) ?? 0

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Learning"
        description="What the system taught itself from real runs: site lessons, remembered answers, and what to fix next."
        actions={
          <Button variant="outline" size="sm" className="gap-2" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {loading && !data && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="panel h-24 shimmer" />)}</div>
          <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="panel h-48 shimmer" />)}</div>
        </div>
      )}

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {/* A missing table is a migration that was never applied — say which one,
          rather than showing an empty state that reads as "nothing learned". */}
      {data?.unavailable && (
        <Card className="border-warning/40">
          <CardContent className="p-4 text-sm space-y-1">
            {Object.entries(data.unavailable).map(([k, v]) => (
              <p key={k}><span className="font-medium capitalize">{k}</span> unavailable — {v}</p>
            ))}
            <p className="text-muted-foreground text-xs pt-1">
              Apply the matching migration in <code>scripts/</code> to enable this section.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat label="Site lessons" value={totalSkills} hint={`${retiredSkills} retired after failing`} />
        <Stat label="Sites covered" value={data?.domains.length ?? 0} />
        <Stat label="Answers remembered" value={data?.answerStats.total ?? 0} />
        <Stat
          label="Answers reused"
          value={data?.answerStats.reusedTotal ?? 0}
          hint="each one saved a model call"
        />
      </div>

      {/* ─── What is going wrong, ranked by how many applications it touched ─── */}
      {data?.health && (
        <Section title="What to fix next" description="Problems from the last 7 days, counted per application">
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            <Stat label="Completed (all time)" value={data.health.queue.completed ?? 0} hint={`${data.health.queue.pending ?? 0} still pending`} />
            <Stat label="Failed (all time)" value={data.health.queue.failed ?? 0} hint={`${data.health.queue.blocked ?? 0} blocked`} />
            <Stat
              label="Runs with refills"
              value={`${data.health.refills.runsWithRefills}/${data.health.refills.runsMeasured}`}
              hint={`${data.health.refills.extraWrites} wasted writes`}
            />
            <Stat
              label="Removed"
              value={Object.values(data.health.removedReasons).reduce((n, v) => n + v, 0)}
              hint="dead links, non-applications, no résumé"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranked
              title="Fields that could not be filled"
              rows={data.health.fieldFailures.map((f) => ({ label: f.field, detail: f.reason, count: f.applications }))}
              empty="None recorded."
            />
            <Ranked
              title="Rejected by the form after Submit"
              rows={data.health.rejections.map((r) => ({ label: r.reason, count: r.applications }))}
              empty="None recorded."
            />
            <Ranked
              title="Answered with a last-resort default"
              rows={data.health.lastResort.map((r) => ({ label: r.field, count: r.applications }))}
              empty="None recorded."
            />
            <Ranked
              title="Why applications were removed"
              rows={Object.entries(data.health.removedReasons).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, count]) => ({ label, count }))}
              empty="None recorded."
            />
          </div>
        </Section>
      )}

      {/* ─── Site knowledge ─── */}
      <Section title="Site knowledge" description="Lessons distilled per site after runs complete, newest version first">
        {data?.domains.length === 0 && !loading && (
          <Card><CardContent className="p-4 text-sm text-muted-foreground">
            No site lessons yet. One is distilled after a run completes, so this fills in as applications go out.
          </CardContent></Card>
        )}
        {data?.domains.map((d) => (
          <Card key={d.domain}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="font-mono text-sm">{d.domain}</span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{d.versions.length} version{d.versions.length === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>used {d.totalUses}×</span>
                </div>
              </div>
              {/* Newest first, so the current belief reads before the history. */}
              {d.versions.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    "rounded-md border p-3 text-sm",
                    v.status === "retired" ? "opacity-60 border-dashed" : "border-border"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Badge variant="outline" className="text-xs">v{v.version}</Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs gap-1",
                        v.score > 0 && "text-chart-2 border-chart-2/40",
                        v.score < 0 && "text-destructive border-destructive/40"
                      )}
                    >
                      {v.score > 0 ? <CheckCircle2 className="h-3 w-3" /> : v.score < 0 ? <XCircle className="h-3 w-3" /> : null}
                      score {v.score > 0 ? `+${v.score}` : v.score}
                    </Badge>
                    {v.status === "retired" && (
                      <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                        <Archive className="h-3 w-3" /> retired
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">used {v.times_used}×</span>
                  </div>
                  <p className="leading-relaxed">{v.content}</p>
                </div>
              ))}
              {d.retired > 0 && (
                <p className="text-xs text-muted-foreground">
                  A lesson retires automatically once three net-negative runs show the site has moved on.
                  It is kept, because what we used to believe matters when a site regresses.
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </Section>

      {/* ─── Outcome evidence ─── */}
      <Section title="Outcomes by site" description="Attempts, submissions and the most common blocker per site">
        <Card className="gap-0 py-0">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <tr>
                  <th className="text-left font-medium p-3">Site</th>
                  <th className="text-right font-medium p-3">Attempts</th>
                  <th className="text-right font-medium p-3">Submitted</th>
                  <th className="text-right font-medium p-3">Avg</th>
                  <th className="text-left font-medium p-3">Most common blocker</th>
                </tr>
              </thead>
              <tbody>
                {data?.outcomes.map((o) => (
                  <tr key={o.domain} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="p-3 font-mono text-xs">{o.domain}</td>
                    <td className="p-3 text-right tabular-nums">{o.attempts}</td>
                    <td className="p-3 text-right tabular-nums">
                      <span className={cn(o.successRate >= 50 ? "text-chart-2" : o.successRate === 0 ? "text-destructive" : "text-warning")}>
                        {o.submitted} ({o.successRate}%)
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">
                      {o.avgSeconds != null ? `${o.avgSeconds}s` : "—"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{o.topReason ?? "—"}</td>
                  </tr>
                ))}
                {!data?.outcomes.length && (
                  <tr><td colSpan={5} className="p-4 text-sm text-muted-foreground">No runs recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </Section>

      {/* ─── Answer bank ─── */}
      <Section title="Most reused answers" description="Answers the system remembered and reused instead of asking a model">
        <Card className="gap-0 py-0">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <tr>
                  <th className="text-left font-medium p-3">Question</th>
                  <th className="text-left font-medium p-3">Answer</th>
                  <th className="text-left font-medium p-3">Scope</th>
                  <th className="text-right font-medium p-3">Used</th>
                </tr>
              </thead>
              <tbody>
                {data?.answerStats.topReused.map((a, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="p-3 max-w-md truncate" title={a.question}>{a.question}</td>
                    <td className={cn("p-3 max-w-xs truncate", a.isSensitive && "text-muted-foreground italic")} title={a.isSensitive ? "sensitive — hidden" : a.answer}>
                      {a.answer}
                    </td>
                    <td className="p-3"><Badge variant="outline" className="text-xs">{a.scope}</Badge></td>
                    <td className="p-3 text-right tabular-nums">{a.timesUsed}×</td>
                  </tr>
                ))}
                {!data?.answerStats.topReused.length && (
                  <tr><td colSpan={4} className="p-4 text-sm text-muted-foreground">No answers reused yet.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </Section>

      {/* ─── Recent runs ─── */}
      <Section title="Recent runs" description="The runs these lessons came from">
        <Card className="gap-0 py-0">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <tr>
                  <th className="text-left font-medium p-3">Company</th>
                  <th className="text-left font-medium p-3">Site</th>
                  <th className="text-left font-medium p-3">Result</th>
                  <th className="text-right font-medium p-3">Time</th>
                  <th className="text-left font-medium p-3">Blocker</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentRuns.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="p-3">{r.company}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{r.domain ?? "—"}</td>
                    <td className="p-3">
                      {r.submitted
                        ? <span className="text-chart-2 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> submitted</span>
                        : <span className="text-destructive flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> blocked</span>}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{r.seconds != null ? `${r.seconds}s` : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-sm truncate" title={r.reason ?? ""}>{r.reason ?? "—"}</td>
                  </tr>
                ))}
                {!data?.recentRuns.length && (
                  <tr><td colSpan={5} className="p-4 text-sm text-muted-foreground">No runs yet.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </Section>
    </div>
  )
}

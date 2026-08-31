"use client"

import { useEffect, useState, useCallback } from "react"
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
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export function LearningScreen() {
  const [data, setData] = useState<LearningData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/learning", { cache: "no-store" })
      const json = await res.json()
      if (json.error) setError(json.error)
      else { setData(json); setError(null) }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const totalSkills = data?.domains.reduce((n, d) => n + d.versions.length, 0) ?? 0
  const retiredSkills = data?.domains.reduce((n, d) => n + d.retired, 0) ?? 0

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Learning
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            What the system has taught itself from real runs — site knowledge it distils, answers it
            remembers, and the outcomes both were derived from. Nothing on this page is hand-written.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Refresh
        </Button>
      </div>

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

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat label="Site lessons" value={totalSkills} hint={`${retiredSkills} retired after failing`} />
        <Stat label="Sites covered" value={data?.domains.length ?? 0} />
        <Stat label="Answers remembered" value={data?.answerStats.total ?? 0} />
        <Stat
          label="Model calls avoided"
          value={data?.answerStats.reusedTotal ?? 0}
          hint="every reuse past the first"
        />
      </div>

      {/* ─── Site knowledge ─── */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Site knowledge</h2>
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
      </div>

      {/* ─── Outcome evidence ─── */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Outcomes by site
        </h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
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
                  <tr key={o.domain} className="border-b last:border-0">
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
      </div>

      {/* ─── Answer bank ─── */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Most reused answers</h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left font-medium p-3">Question</th>
                  <th className="text-left font-medium p-3">Answer</th>
                  <th className="text-left font-medium p-3">Scope</th>
                  <th className="text-right font-medium p-3">Used</th>
                </tr>
              </thead>
              <tbody>
                {data?.answerStats.topReused.map((a, i) => (
                  <tr key={i} className="border-b last:border-0">
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
      </div>

      {/* ─── Recent runs ─── */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Runs these lessons came from</h2>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
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
                  <tr key={i} className="border-b last:border-0">
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
      </div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FlaskConical, RefreshCw } from "lucide-react"
import { IrisAdminGate, irisAdminFetch } from "@/components/iris-admin-gate"

type Settings = { enabled: boolean; paywall_percent: number; run: string; started_at: string; updated_at: string; force_all?: boolean }
type Row = {
  run: string; variant: "paywall" | "control"; users: number; applied: number; saw_paywall: number
  paid: number; paid_after_first: number; avg_hours_to_pay: number | null; revenue: Record<string, number>
}

const PRESETS = [50, 70, 30, 90, 10]
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "–")
const money = (r: Record<string, number>) => {
  const parts = Object.entries(r || {}).map(([c, v]) => `${c} ${Number(v).toLocaleString()}`)
  return parts.length ? parts.join(" + ") : "–"
}

function Experiments() {
  const { toast } = useToast()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [percent, setPercent] = useState(50)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await irisAdminFetch("/api/web-experiments")
      setSettings(d.settings); setRows(d.results); setPercent(d.settings?.paywall_percent ?? 50)
    } catch (e) { toast({ title: "Could not load", description: String((e as Error).message), variant: "destructive" }) }
  }, [toast])
  useEffect(() => { void load() }, [load])

  const save = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true)
    try {
      const d = await irisAdminFetch("/api/web-experiments", { method: "POST", body: JSON.stringify(body) })
      setSettings(d.settings); setPercent(d.settings.paywall_percent)
      toast({ title: msg })
      void load()
    } catch (e) { toast({ title: "Not saved", description: String((e as Error).message), variant: "destructive" }) }
    finally { setBusy(false) }
  }

  const runs = [...new Set(rows.map(r => r.run))]
  const current = settings?.run

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-4 w-4" />Pay after the first application</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              Website only. New sign-ups (outside Africa) are split into two groups. <b>Paywall</b>: the onboarding application is free, then they must buy a plan (same rule as Africa).
              <b> Free swipes</b>: the usual free applications. Each person stays in their group. Turning it off sends everyone back to free swipes; results are kept.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Badge variant={settings?.enabled ? "default" : "secondary"}>{settings?.enabled ? "Running" : "Off"}</Badge>
            <Switch checked={!!settings?.enabled} disabled={busy || !settings} onCheckedChange={v => save({ enabled: v }, v ? "Experiment is on" : "Experiment is off")} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Share of new sign-ups who get the paywall</div>
              <div className="flex items-center gap-2">
                <Input type="number" min={0} max={100} value={percent} onChange={e => setPercent(Math.max(0, Math.min(100, Number(e.target.value))))} className="w-24" />
                <span className="text-sm">% paywall · {100 - percent}% free swipes</span>
              </div>
            </div>
            <div className="flex gap-1.5">
              {PRESETS.map(p => <Button key={p} size="sm" variant={percent === p ? "default" : "outline"} onClick={() => setPercent(p)}>{p}/{100 - p}</Button>)}
            </div>
            <Button disabled={busy || percent === settings?.paywall_percent} onClick={() => save({ percent }, `Split saved: ${percent}/${100 - percent}`)}>Save split</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>Current run: <b className="text-foreground">{current ?? "–"}</b></span>
            {settings?.started_at && <span>· counting sign-ups since {new Date(settings.started_at).toLocaleString()}</span>}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (confirm("Start a new run? Only people who sign up from now on will be in it; earlier results stay listed.")) void save({ newRun: true }, "New run started") }}>Start a new run</Button>
            <Button size="sm" variant="ghost" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh</Button>
          </div>
        </CardContent>
      </Card>

      <Card className={settings?.force_all ? "border-violet-500/60" : ""}>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 font-semibold">Everyone pays after the first application
              <Badge variant={settings?.force_all ? "default" : "secondary"}>{settings?.force_all ? "On: everyone is on Group B" : "Off"}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Puts <b>every website user</b> who isn't on a plan on the Group B rule: the onboarding application is free, then they must buy.
              That includes existing users and new sign-ups, whatever their test group, and skips the welcome emails. The mobile app is unaffected.
              Turn it off to go back to the split above; results and groups are kept.
            </p>
          </div>
          <Switch
            checked={!!settings?.force_all}
            disabled={busy || !settings}
            onCheckedChange={v => {
              if (v && !confirm("Make everyone pay after their first application?\n\nEvery website user without a plan, including your existing users, gets the paywall straight away.")) return
              void save({ forceAll: v }, v ? "Everyone now pays after the first application" : "Back to the A/B split")
            }}
          />
        </CardContent>
      </Card>

      {runs.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No one is in the experiment yet. Turn it on; results appear as new people sign up.</CardContent></Card>}

      {runs.map(run => {
        const rs = rows.filter(r => r.run === run)
        const pay = rs.find(r => r.variant === "paywall"), ctl = rs.find(r => r.variant === "control")
        const conv = (r?: Row) => (r && r.users ? r.paid / r.users : 0)
        const lift = pay && ctl && conv(ctl) > 0 ? ((conv(pay) - conv(ctl)) / conv(ctl)) * 100 : null
        return (
          <Card key={run}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">Results · {run}{run === current && <Badge variant="secondary">current</Badge>}</CardTitle>
              {lift !== null && <p className="text-sm text-muted-foreground">Paywall group converts <b className={lift >= 0 ? "text-emerald-600" : "text-red-600"}>{lift >= 0 ? "+" : ""}{lift.toFixed(0)}%</b> {lift >= 0 ? "more" : "less"} than free swipes (paid ÷ sign-ups).</p>}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Group</TableHead><TableHead className="text-right">Sign-ups</TableHead><TableHead className="text-right">Applied</TableHead>
                  <TableHead className="text-right">Saw paywall</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Paid after 1st application</TableHead>
                  <TableHead className="text-right">Conversion</TableHead><TableHead className="text-right">Avg time to pay</TableHead><TableHead className="text-right">Revenue (first payment)</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rs.map(r => (
                    <TableRow key={r.variant}>
                      <TableCell><Badge variant={r.variant === "paywall" ? "default" : "outline"}>{r.variant === "paywall" ? "Paywall" : "Free swipes"}</Badge></TableCell>
                      <TableCell className="text-right">{r.users}</TableCell>
                      <TableCell className="text-right">{r.applied} <span className="text-muted-foreground text-xs">({pct(r.applied, r.users)})</span></TableCell>
                      <TableCell className="text-right">{r.saw_paywall} <span className="text-muted-foreground text-xs">({pct(r.saw_paywall, r.users)})</span></TableCell>
                      <TableCell className="text-right font-semibold">{r.paid}</TableCell>
                      <TableCell className="text-right">{r.paid_after_first} <span className="text-muted-foreground text-xs">({pct(r.paid_after_first, r.applied)} of appliers)</span></TableCell>
                      <TableCell className="text-right font-semibold">{pct(r.paid, r.users)}</TableCell>
                      <TableCell className="text-right">{r.avg_hours_to_pay == null ? "–" : r.avg_hours_to_pay < 48 ? `${r.avg_hours_to_pay}h` : `${(r.avg_hours_to_pay / 24).toFixed(1)}d`}</TableCell>
                      <TableCell className="text-right">{money(r.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">Paid = first website plan purchase (Dodo) after joining the test. Purchases inside the mobile app aren't counted. Give each run at least 2–3 weeks before deciding.</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export function WebExperimentsScreen() {
  return <IrisAdminGate>{() => <Experiments />}</IrisAdminGate>
}

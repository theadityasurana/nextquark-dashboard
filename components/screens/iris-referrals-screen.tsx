"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Copy, ExternalLink, Megaphone, RefreshCw, Trash2 } from "lucide-react"
import { IrisAdminGate, irisAdminFetch } from "@/components/iris-admin-gate"

type Stats = {
  buyers: number; active: number; last30: number; netCents: number; earnedCents: number; paidCents: number; dueCents: number
  commissionPercent: number; byPlan: Record<string, number>; discountFound: boolean; unsettled: number
}
type Partner = {
  id: string; name: string; promo_code: string; slug: string; email?: string; social?: string; notes?: string
  active: boolean; source?: string; clicks?: number; stats: Stats
}
type Data = { updatedAt: string; partners: Partner[]; unassignedCodes: { code: string; timesUsed: number }[] }

const usd = (c: number) => `$${((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const bioLink = (code: string) => `https://irisjobs.live/?code=${encodeURIComponent(code)}`
const dashLink = (slug: string) => `https://irisjobs.live/partner/${slug}`

function Referrals({ adminKey, onDenied }: { adminKey: string; onDenied: () => void }) {
  const { toast } = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: "", promo_code: "", commission_percent: "20" })

  const call = useCallback((init: RequestInit = {}, qs = "") => irisAdminFetch(adminKey, `/api/iris-referrals${qs}`, init, onDenied), [adminKey, onDenied])
  const load = useCallback(async (fresh = false) => {
    setLoading(true)
    try { setData(await call({}, fresh ? "?fresh=1" : "")) }
    catch (e) { toast({ title: "Could not load referrals", description: String((e as Error).message), variant: "destructive" }) }
    finally { setLoading(false) }
  }, [call, toast])
  useEffect(() => { void load() }, [load])

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast({ title: msg }); await load() }
    catch (e) { toast({ title: "Not saved", description: String((e as Error).message), variant: "destructive" }) }
  }
  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast({ title: "Copied", description: t }) }

  const ps = [...(data?.partners ?? [])].sort((a, b) => (b.stats.buyers - a.stats.buyers) || ((b.clicks || 0) - (a.clicks || 0)))
  const sum = (f: (p: Partner) => number) => ps.reduce((n, p) => n + f(p), 0)

  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {[
          ["Influencers", ps.length.toString()],
          ["Link clicks", sum(p => p.clicks || 0).toLocaleString()],
          ["Purchases via codes", sum(p => p.stats.buyers).toString()],
          ["Net revenue", usd(sum(p => p.stats.netCents))],
          ["Due to influencers", usd(sum(p => p.stats.dueCents))],
        ].map(([l, v]) => (
          <Card key={l}><CardContent className="p-4"><div className="text-2xl font-semibold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-4 w-4" />Add an influencer</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); void act(() => call({ method: "POST", body: JSON.stringify(form) }), `${form.name} added`).then(() => setForm({ name: "", promo_code: "", commission_percent: "20" })) }}>
            <Input className="w-48" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input className="w-40 uppercase" placeholder="Dodo code (e.g. ARJUN10)" list="iris-codes" value={form.promo_code} onChange={e => setForm({ ...form, promo_code: e.target.value.toUpperCase() })} />
            <datalist id="iris-codes">{data?.unassignedCodes.map(c => <option key={c.code} value={c.code} />)}</datalist>
            <div className="flex items-center gap-1"><Input className="w-20" type="number" min={0} max={100} value={form.commission_percent} onChange={e => setForm({ ...form, commission_percent: e.target.value })} /><span className="text-sm text-muted-foreground">% share</span></div>
            <Button type="submit" disabled={!form.name.trim() || !form.promo_code.trim()}>Add</Button>
          </form>
          {!!data?.unassignedCodes.length && <p className="mt-3 text-xs text-muted-foreground">Codes in Dodo not linked to anyone yet: {data.unassignedCodes.map(c => c.code).join(", ")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Leaderboard</CardTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {data?.updatedAt && <span>Dodo data as of {new Date(data.updatedAt).toLocaleString()}</span>}
            <Button size="sm" variant="outline" disabled={loading} onClick={() => void load(true)}><RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh from Dodo</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Influencer</TableHead><TableHead className="text-right">Link clicks</TableHead><TableHead className="text-right">Purchases</TableHead>
              <TableHead className="text-right">Active</TableHead><TableHead className="text-right">30 days</TableHead><TableHead className="text-right">Net revenue</TableHead>
              <TableHead className="text-right">Share</TableHead><TableHead className="text-right">Earned</TableHead><TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead><TableHead>Plans</TableHead><TableHead>Dashboard on</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {ps.length === 0 && <TableRow><TableCell colSpan={13} className="py-8 text-center text-muted-foreground">{loading ? "Loading…" : "No influencers yet."}</TableCell></TableRow>}
              {ps.map(p => {
                const s = p.stats
                return (
                  <TableRow key={p.id}>
                    <TableCell className="min-w-[260px]">
                      <div className="font-medium">{p.name} <Badge variant="outline" className="ml-1 font-mono">{p.promo_code}</Badge>{!s.discountFound && <Badge variant="destructive" className="ml-1">code not in Dodo</Badge>}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => copy(bioLink(p.promo_code))}><Copy className="h-3 w-3" />Bio link</button>
                        <a className="inline-flex items-center gap-1 hover:text-foreground" href={dashLink(p.slug)} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" />Their dashboard</a>
                        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => copy(dashLink(p.slug))}><Copy className="h-3 w-3" />Dashboard link</button>
                      </div>
                      {p.notes && <div className="mt-1 text-xs text-muted-foreground">{p.notes}</div>}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{(p.clicks || 0).toLocaleString()}{p.clicks ? <div className="text-xs font-normal text-muted-foreground">{s.buyers ? `${((s.buyers / p.clicks) * 100).toFixed(1)}% bought` : "no buys yet"}</div> : null}</TableCell>
                    <TableCell className="text-right font-semibold">{s.buyers}</TableCell>
                    <TableCell className="text-right">{s.active}</TableCell>
                    <TableCell className="text-right">{s.last30}</TableCell>
                    <TableCell className="text-right">{usd(s.netCents)}{s.unsettled ? <div className="text-xs text-muted-foreground">+{s.unsettled} settling</div> : null}</TableCell>
                    <TableCell className="text-right">{+s.commissionPercent}%</TableCell>
                    <TableCell className="text-right font-semibold">{usd(s.earnedCents)}</TableCell>
                    <TableCell className="text-right">{usd(s.paidCents)}</TableCell>
                    <TableCell className="text-right">{usd(s.dueCents)}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{Object.entries(s.byPlan).map(([k, v]) => <Badge key={k} variant="secondary">{k} {v}</Badge>)}</div></TableCell>
                    <TableCell><Switch checked={p.active} onCheckedChange={v => void act(() => call({ method: "PATCH", body: JSON.stringify({ id: p.id, active: v }) }), v ? "Their dashboard is on" : "Their dashboard is off")} /></TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.dueCents > 0 && <Button size="sm" variant="outline" className="mr-1" onClick={() => { if (confirm(`Mark ${usd(s.dueCents)} as paid to ${p.name}?`)) void act(() => call({ method: "PATCH", body: JSON.stringify({ id: p.id, paid_out: s.earnedCents / 100 }) }), "Marked paid") }}>Mark paid</Button>}
                      <Button size="icon" variant="ghost" title="Remove" onClick={() => { if (confirm(`Remove ${p.name}? Their Dodo code is not touched.`)) void act(() => call({ method: "DELETE" }, `?id=${encodeURIComponent(p.id)}`), "Removed") }}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">Link clicks = visits to irisjobs.live/?code=CODE (every page load, counted since Nov 26). Earnings = share % of what Iris receives after taxes and fees, first payments only, in USD.</p>
        </CardContent>
      </Card>
    </div>
  )
}

export function IrisReferralsScreen() {
  return <IrisAdminGate>{(key, signOut) => <Referrals adminKey={key} onDenied={signOut} />}</IrisAdminGate>
}

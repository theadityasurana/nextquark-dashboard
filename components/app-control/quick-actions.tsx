"use client"

// Quick actions for the §7 recipes. Each opens the shared review/confirm flow.

import { useState, type ReactNode } from "react"
import { Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ALLOWED, effective, type ConfigRow, type Json } from "@/lib/remote-config/core"
import { sectionDef } from "@/lib/remote-config/fields"
import { SaveDialog, type PendingChange } from "./save-dialog"

type Rows = Record<string, ConfigRow | undefined>

interface Pending {
  key: string
  change: PendingChange
  title: string
  reminder?: string
  note?: string
}

function Action({ title, help, children, onApply, disabled }: { title: string; help: string; children: ReactNode; onApply: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2 panel p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground">{help}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-auto">
        {children}
        <Button size="sm" variant="secondary" className="h-8 ml-auto" onClick={onApply} disabled={disabled}>Review…</Button>
      </div>
    </div>
  )
}

const num = (rows: Rows, key: string, path: string[]): number => {
  const r = rows[key]
  const v = r ? effective(r.value, r.default_value, path) : undefined
  return typeof v === "number" ? v : 0
}
const val = (rows: Rows, key: string, path: string[]): Json | undefined => {
  const r = rows[key]
  return r ? effective(r.value, r.default_value, path) : undefined
}

export function QuickActions({ rows, onSaved }: { rows: Rows; onSaved: (row: ConfigRow) => void }) {
  const [pending, setPending] = useState<Pending | null>(null)

  const [freeSwipes, setFreeSwipes] = useState(String(num(rows, "limits", ["free_swipes_per_cycle"])))
  const [promo, setPromo] = useState(String(Math.max(10, num(rows, "limits", ["referral_reward_referee"]))))
  const hidden = (val(rows, "paywall", ["hidden_plans"]) as string[] | undefined) ?? []
  const ultraShown = !hidden.includes("ultra")
  const [ultra, setUltra] = useState(ultraShown)
  const [highlight, setHighlight] = useState(String(val(rows, "paywall", ["highlighted_plan"]) ?? "pro"))
  const locationOn = val(rows, "job_card", ["header", "show_location"]) === true
  const [location, setLocation] = useState(locationOn)
  const targets = ((val(rows, "features", ["share_targets"]) as string[] | undefined) ?? []).filter(t => typeof t === "string")
  const [share, setShare] = useState<string[]>(targets)
  const followOn = val(rows, "features", ["social_follow_enabled"]) !== false
  const [follow, setFollow] = useState(followOn)
  const [feed, setFeed] = useState(String(val(rows, "features", ["feed_source"]) ?? "client"))

  const open = (p: Pending) => rows[p.key] && setPending(p)
  const freeN = Number(freeSwipes)
  const promoN = Number(promo)
  const validInt = (n: number) => Number.isInteger(n) && n >= 0

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />Quick actions</CardTitle>
        <p className="text-xs text-muted-foreground">Common changes. Each one opens the same review and confirm step as the editors.</p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Action
          title="Free swipes per cycle"
          help={`Currently ${num(rows, "limits", ["free_swipes_per_cycle"])}. New users get it now; existing users at their next reset.`}
          disabled={!validInt(freeN) || freeN === num(rows, "limits", ["free_swipes_per_cycle"])}
          onApply={() => open({ key: "limits", title: "Free swipes per cycle", change: { kind: "field", path: ["free_swipes_per_cycle"], value: freeN } })}
        >
          <Input type="number" min={0} step={1} className="h-8 w-24 font-mono" value={freeSwipes} onChange={e => setFreeSwipes(e.target.value)} />
        </Action>

        <Action
          title="Referral promo"
          help={`Sets both referral rewards (now ${num(rows, "limits", ["referral_reward_referrer"])} / ${num(rows, "limits", ["referral_reward_referee"])}).`}
          disabled={!validInt(promoN)}
          onApply={() => {
            const r = rows.limits!
            open({
              key: "limits",
              title: "Referral promo",
              note: "referral promo",
              reminder: `When the promo ends, open History for limits and restore version ${r.version} (the version before this promo). If you also changed the Free Swipes sheet subtitle, restore that too.`,
              change: { kind: "section", value: { ...r.value, referral_reward_referrer: promoN, referral_reward_referee: promoN } },
            })
          }}
        >
          <Input type="number" min={0} step={1} className="h-8 w-24 font-mono" value={promo} onChange={e => setPromo(e.target.value)} />
          <span className="text-xs text-muted-foreground">swipes each</span>
        </Action>

        <Action
          title="Ultra plan"
          help="Show or hide the Ultra plan card on the paywall."
          disabled={ultra === ultraShown}
          onApply={() => open({
            key: "paywall", title: ultra ? "Show the Ultra plan" : "Hide the Ultra plan",
            change: { kind: "field", path: ["hidden_plans"], value: ultra ? hidden.filter(p => p !== "ultra") : [...hidden, "ultra"] },
          })}
        >
          <Switch checked={ultra} onCheckedChange={setUltra} />
          <span className="text-xs">{ultra ? "Shown" : "Hidden"}</span>
        </Action>

        <Action
          title="Highlighted plan"
          help="Plan that gets the badge on the paywall."
          disabled={highlight === String(val(rows, "paywall", ["highlighted_plan"]))}
          onApply={() => open({ key: "paywall", title: "Highlighted plan", change: { kind: "field", path: ["highlighted_plan"], value: highlight } })}
        >
          <Select value={highlight} onValueChange={setHighlight}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALLOWED.plans.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              <SelectItem value="none">none (no badge)</SelectItem>
            </SelectContent>
          </Select>
        </Action>

        <Action
          title="Location on job cards"
          help="Also applies to older app versions."
          disabled={location === locationOn}
          onApply={() => open({ key: "job_card", title: location ? "Show location on cards" : "Hide location on cards", change: { kind: "field", path: ["header", "show_location"], value: location } })}
        >
          <Switch checked={location} onCheckedChange={setLocation} />
          <span className="text-xs">{location ? "Shown" : "Hidden"}</span>
        </Action>

        <Action
          title="Share buttons"
          help="Buttons in the Free Swipes sheet. Order is kept; edit Feature switches to reorder."
          disabled={JSON.stringify(share) === JSON.stringify(targets)}
          onApply={() => open({ key: "features", title: "Share buttons", change: { kind: "field", path: ["share_targets"], value: share } })}
        >
          {ALLOWED.share_targets.map(t => (
            <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox
                checked={share.includes(t)}
                onCheckedChange={c => setShare(c ? ALLOWED.share_targets.filter(x => x === t || share.includes(x)).sort((a, b) => orderIn(targets, a) - orderIn(targets, b)) : share.filter(x => x !== t))}
              />
              {t}
            </label>
          ))}
        </Action>

        <Action
          title="Follow for free swipes"
          help="The follow section in both sheets."
          disabled={follow === followOn}
          onApply={() => open({ key: "features", title: follow ? "Turn on follow for swipes" : "Turn off follow for swipes", change: { kind: "field", path: ["social_follow_enabled"], value: follow } })}
        >
          <Switch checked={follow} onCheckedChange={setFollow} />
          <span className="text-xs">{follow ? "On" : "Off"}</span>
        </Action>

        <Action
          title="Feed source"
          help="Server needs get-feed deployed. The app falls back to client on any error."
          disabled={feed === String(val(rows, "features", ["feed_source"]))}
          onApply={() => open({
            key: "features", title: `Feed source: ${feed}`,
            reminder: feed === "server" ? "After saving, watch the get-feed logs in Supabase. If anything looks wrong, switch back to client." : undefined,
            change: { kind: "field", path: ["feed_source"], value: feed },
          })}
        >
          <Select value={feed} onValueChange={setFeed}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{ALLOWED.feed_source.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
        </Action>
      </CardContent>

      {pending && rows[pending.key] && (
        <SaveDialog
          open
          onOpenChange={o => !o && setPending(null)}
          sectionKey={pending.key}
          sectionName={sectionDef(pending.key)?.name ?? pending.key}
          loaded={rows[pending.key]!}
          change={pending.change}
          title={pending.title}
          reminder={pending.reminder}
          defaultNote={pending.note}
          onSaved={onSaved}
        />
      )}
    </Card>
  )
}

/** Keep the current order for re-enabled buttons; unknown ones go to their default spot. */
function orderIn(current: string[], t: string): number {
  const i = current.indexOf(t)
  return i === -1 ? 10 + (ALLOWED.share_targets as readonly string[]).indexOf(t) : i
}

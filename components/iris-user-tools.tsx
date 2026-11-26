"use client"

import { useState } from "react"
import useSWR from "swr"
import { RotateCcw, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { irisAdminFetch } from "@/components/iris-admin-gate"

export type Group = "paywall" | "control"

/** Website A/B group for a set of users, in one request: { [userId]: 'paywall' | 'control' }. */
export function useExperimentGroups(userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))].sort()
  const { data } = useSWR<Record<string, Group>>(
    ids.length ? `/api/web-experiments/groups?ids=${ids.join(",")}` : null,
    (u: string) => fetch(u).then(r => (r.ok ? r.json() : {})),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  )
  return data ?? {}
}

/**
 * B · Paywall: in the test, first application free then pay.
 * A · 10 free credits: in the test's free group, or signed up before the test (everyone else).
 */
export function GroupBadge({ group, className = "" }: { group?: Group; className?: string }) {
  const paywall = group === "paywall"
  const title = paywall
    ? "Group B (A/B test): first application free, then pay"
    : group === "control" ? "Group A (A/B test): the usual 10 free credits" : "Not in the A/B test: the usual 10 free credits"
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${paywall ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "border border-border text-muted-foreground"} ${className}`}
    >
      {paywall ? "B · Paywall" : "A · 10 free credits"}
    </span>
  )
}

/** Reset swipes + Delete account. */
export function UserAdminActions({ userId, email, onDeleted, size = "sm" }: {
  userId: string; email?: string; onDeleted?: () => void; size?: "sm" | "md"
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<"" | "reset" | "delete">("")

  const run = async (kind: "reset" | "delete") => {
    const who = email || userId.slice(0, 8)
    if (kind === "delete" && !window.confirm(`Delete ${who}'s account permanently?\n\nTheir profile, applications, resumes, emails and website plan are removed. This can't be undone.`)) return
    if (kind === "reset" && !window.confirm(`Reset ${who}'s free swipes to the full allowance?`)) return
    setBusy(kind)
    try {
      const out = await irisAdminFetch(`/api/iris-users/${userId}`,
        kind === "delete" ? { method: "DELETE" } : { method: "POST", body: JSON.stringify({ action: "reset-swipes" }) })
      toast({ title: kind === "delete" ? `Deleted ${who}` : `${who} has ${out.swipes} free swipes again` })
      if (kind === "delete") onDeleted?.()
    } catch (e) {
      toast({ title: kind === "delete" ? "Not deleted" : "Not reset", description: String((e as Error).message), variant: "destructive" })
    } finally { setBusy("") }
  }

  const cls = size === "sm"
    ? "inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium transition-colors disabled:opacity-50"
    : "inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium transition-colors disabled:opacity-50"
  return (
    <span className="inline-flex items-center gap-1.5" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button type="button" className={`${cls} hover:bg-muted`} disabled={!!busy} onClick={() => void run("reset")} title="Reset free swipes">
        <RotateCcw className="h-3 w-3" />{busy === "reset" ? "Resetting…" : "Reset swipes"}
      </button>
      <button type="button" className={`${cls} text-destructive hover:bg-destructive/10`} disabled={!!busy} onClick={() => void run("delete")} title="Delete account">
        <Trash2 className="h-3 w-3" />{busy === "delete" ? "Deleting…" : "Delete"}
      </button>
    </span>
  )
}

"use client"

import { useState } from "react"
import useSWR from "swr"
import { Users } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, EmptyState } from "@/components/ui/dashboard"
import { fetchJson } from "@/lib/api-cache"

type ActiveUser = {
  id: string
  name: string
  plan: string | null
  lastSeen: string
  activeNow: boolean
  rightSwipes: number
  swipesLeft: number | null
  lastJob: string | null
}

type ActiveUsersResponse = {
  activeNow: number
  recent: number
  activeWindowMinutes: number
  recentWindowMinutes: number
  users: ActiveUser[]
}

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

function LiveDot({ on }: { on: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {on && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${on ? "bg-success" : "bg-muted-foreground/40"}`} />
    </span>
  )
}

/** "N active now" pill for the overview header; opens a list of who is using the app. */
export function ActiveUsersIndicator() {
  const [open, setOpen] = useState(false)
  const { data } = useSWR<ActiveUsersResponse>("/api/overview/active-users", (u: string) => fetchJson<ActiveUsersResponse>(u, true), {
    refreshInterval: 30_000,
    keepPreviousData: true,
  })

  const count = data?.activeNow ?? 0
  const users = data?.users ?? []

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
        title={data ? `Users who swiped or edited their profile in the last ${data.activeWindowMinutes} minutes` : undefined}
      >
        <LiveDot on={count > 0} />
        <span className="tabular-nums">{data ? count.toLocaleString() : "–"}</span>
        <span className="text-muted-foreground">active now</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LiveDot on={count > 0} />
              {count.toLocaleString()} active now
            </DialogTitle>
            <DialogDescription>
              Active means they swiped or edited their profile in the last {data?.activeWindowMinutes ?? 5} minutes.
              Also showing everyone seen in the last {data?.recentWindowMinutes ?? 30} minutes. Updates every 30 seconds.
            </DialogDescription>
          </DialogHeader>

          {users.length === 0 ? (
            <EmptyState icon={Users} title="No one is in the app right now" description={`Nobody has been active in the last ${data?.recentWindowMinutes ?? 30} minutes.`} />
          ) : (
            <ul className="-mx-2 max-h-[60vh] divide-y divide-border overflow-y-auto">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-2 py-2.5">
                  <Avatar name={u.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{u.name}</span>
                      {u.plan && u.plan !== "free" && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">{u.plan}</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.rightSwipes > 0
                        ? `${u.rightSwipes} right swipe${u.rightSwipes === 1 ? "" : "s"}${u.lastJob ? ` · last: ${u.lastJob}` : ""}`
                        : "Browsing / editing profile"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                    <LiveDot on={u.activeNow} />
                    {ago(u.lastSeen)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

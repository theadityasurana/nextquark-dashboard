"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Bell, BellOff, BellRing } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ensurePushSubscription, removePushSubscription } from "@/lib/push-client"

/**
 * Native macOS/desktop notifications through Chrome:
 *   - a new user signs up
 *   - a user starts a paid plan
 *   - Supabase health turns degraded / down (and when it recovers)
 *
 * Primary path is web push from /api/cron/admin-notify (pg_cron, every
 * minute), so alerts arrive with the dashboard closed, as long as Chrome is
 * running. If push can't be set up, this falls back to polling from the open
 * tab. Health is polled from the tab too, which also catches the case where
 * the dashboard API itself is unreachable; same tag, so no duplicates.
 */

const EVENTS_EVERY_MS = 60_000
const HEALTH_EVERY_MS = 120_000
const K_CURSOR = "iris.notify.cursor"
const K_SEEN = "iris.notify.seen"
const K_HEALTH = "iris.notify.health"
const K_MUTED = "iris.notify.muted"

type Health = "healthy" | "degraded" | "down"

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode */ }
}

/** Mark an event id as shown; false if another tab already showed it. */
function claim(id: string): boolean {
  let seen: string[] = []
  try { seen = JSON.parse(lsGet(K_SEEN) || "[]") } catch { /* corrupt */ }
  if (seen.includes(id)) return false
  lsSet(K_SEEN, JSON.stringify([...seen, id].slice(-300)))
  return true
}

async function show(title: string, body: string, opts: { tag: string; url: string; urgent?: boolean }) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return
  const options: NotificationOptions = {
    body,
    tag: opts.tag,
    icon: "/applogo.png",
    badge: "/applogo.png",
    data: { url: opts.url },
    requireInteraction: !!opts.urgent,
  }
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (reg) { await reg.showNotification(title, options); return }
  } catch { /* fall through */ }
  const n = new Notification(title, options)
  n.onclick = () => { window.focus(); window.location.assign(opts.url); n.close() }
}

export function DesktopNotifier() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")
  const [muted, setMuted] = useState(false)
  const [pushOk, setPushOk] = useState(false)
  const healthFailures = useRef(0)

  useEffect(() => {
    if (!("Notification" in window)) { setPermission("unsupported"); return }
    setPermission(Notification.permission)
    setMuted(lsGet(K_MUTED) === "1")
    // Permission can also be granted by the PWA prompt or Chrome's site settings.
    navigator.permissions?.query({ name: "notifications" as PermissionName })
      .then((st) => { st.onchange = () => setPermission(Notification.permission) })
      .catch(() => {})
  }, [])

  const active = permission === "granted" && !muted

  // Keep the server's copy of this browser's push subscription fresh.
  useEffect(() => {
    if (!active) { setPushOk(false); return }
    let cancelled = false
    void ensurePushSubscription().then((ok) => { if (!cancelled) setPushOk(ok) })
    return () => { cancelled = true }
  }, [active])

  const pollEvents = useCallback(async () => {
    const cursor = lsGet(K_CURSOR)
    try {
      const res = await fetch(`/api/admin-events${cursor ? `?since=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) return
      for (const s of data.signups ?? []) {
        if (!claim(`signup:${s.id}`)) continue
        await show("New signup 🎉", `${s.name}${s.location ? ` · ${s.location}` : ""} just joined Iris`, { tag: `signup-${s.id}`, url: "/users" })
      }
      for (const u of data.upgrades ?? []) {
        if (!claim(`paid:${u.id}:${u.at}`)) continue
        const plan = [u.plan, u.period].filter(Boolean).join(" · ")
        await show("New paid user 💰", `${u.name} upgraded to ${plan}`, { tag: `paid-${u.id}`, url: "/pricing" })
      }
      if (data.now) lsSet(K_CURSOR, data.now)
    } catch { /* offline — retry next tick with same cursor */ }
  }, [])

  const pollHealth = useCallback(async () => {
    let status: Health
    let detail = ""
    try {
      const res = await fetch("/api/system-health", { cache: "no-store" })
      const data = await res.json()
      status = data.overallStatus as Health
      const bad = (data.services ?? []).filter((s: { status: Health }) => s.status !== "healthy")
      detail = bad.map((s: { name: string; status: Health }) => `${s.name}: ${s.status}`).join(", ")
      healthFailures.current = 0
    } catch {
      // Two misses in a row = can't reach the health check at all.
      healthFailures.current += 1
      if (healthFailures.current < 2) return
      status = "down"
      detail = "Health check unreachable"
    }
    if (!status) return
    const prev = (lsGet(K_HEALTH) as Health | null) ?? "healthy"
    if (status === prev) return
    lsSet(K_HEALTH, status)
    if (status === "healthy") {
      await show("Supabase recovered ✅", "All services are healthy again", { tag: "supabase-health", url: "/settings" })
    } else {
      await show(
        status === "down" ? "🔴 Supabase is DOWN" : "🟠 Supabase degraded",
        detail || `Overall status: ${status}`,
        { tag: "supabase-health", url: "/settings", urgent: status === "down" },
      )
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void pollHealth()
    const b = setInterval(pollHealth, HEALTH_EVERY_MS)
    // With push working the server announces signups/upgrades; polling them
    // here too would just repeat them.
    let a: ReturnType<typeof setInterval> | undefined
    if (!pushOk) {
      void pollEvents()
      a = setInterval(pollEvents, EVENTS_EVERY_MS)
    }
    return () => { clearInterval(b); if (a) clearInterval(a) }
  }, [active, pushOk, pollEvents, pollHealth])

  const onClick = async () => {
    if (permission === "unsupported" || permission === "denied") return
    if (permission === "default") {
      const p = await Notification.requestPermission()
      setPermission(p)
      if (p === "granted") {
        lsSet(K_MUTED, "0"); setMuted(false)
        await show("Notifications on", "You'll get signups, paid upgrades and Supabase health alerts here.", { tag: "notify-test", url: "/" })
      }
      return
    }
    const next = !muted
    setMuted(next)
    lsSet(K_MUTED, next ? "1" : "0")
    if (next) await removePushSubscription() // pause = stop server push too
    if (!next) await show("Notifications on", "Signups, paid upgrades and Supabase health alerts are back on.", { tag: "notify-test", url: "/" })
  }

  if (permission === "unsupported") return null

  const label =
    permission === "denied" ? "Notifications blocked: allow them for this site in Chrome's site settings"
    : permission === "default" ? "Turn on desktop notifications"
    : muted ? "Desktop notifications paused (click to resume)"
    : pushOk ? "Desktop notifications on, even with this tab closed (click to pause)"
    : "Desktop notifications on while this tab is open (click to pause)"

  const Icon = permission === "granted" && !muted ? BellRing : permission === "default" ? Bell : BellOff

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-8 w-8 ${active ? "text-success" : "text-muted-foreground"}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}

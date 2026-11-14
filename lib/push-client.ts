"use client"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"))
}

/**
 * Makes sure this browser has a push subscription and the server has it
 * stored. Always re-sends it (idempotent upsert), because the old server kept
 * subscriptions in memory and forgot them. Returns true when push is active.
 */
export async function ensurePushSubscription(): Promise<boolean> {
  try {
    if (Notification.permission !== "granted") return false
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const reg = await registration()
    if (!reg || !publicKey) return false
    await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }))
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON() }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function removePushSubscription(): Promise<void> {
  try {
    const reg = await registration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }),
    })
    await sub.unsubscribe()
  } catch { /* best effort */ }
}

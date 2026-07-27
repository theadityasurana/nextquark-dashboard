"use client"

import { useEffect } from "react"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

async function subscribeToPush(registration: ServiceWorkerRegistration) {
  try {
    const existing = await registration.pushManager.getSubscription()
    if (existing) return

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) return

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "subscribe", subscription }),
    })
  } catch {
    // Silently fail if push not supported or denied
  }
}

export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    navigator.serviceWorker
      .register("/sw.js")
      .then(async (registration) => {
        if (!("Notification" in window)) return

        if (Notification.permission === "granted") {
          await subscribeToPush(registration)
        } else if (Notification.permission === "default") {
          // Request permission after a short delay so it doesn't feel intrusive
          setTimeout(async () => {
            const permission = await Notification.requestPermission()
            if (permission === "granted") {
              await subscribeToPush(registration)
            }
          }, 3000)
        }
      })
      .catch(() => {})
  }, [])

  return null
}

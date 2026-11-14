"use client"

import { useEffect } from "react"
import { ensurePushSubscription } from "@/lib/push-client"

/** Registers the service worker. Push is (re)subscribed by DesktopNotifier,
 *  which owns the permission prompt and the on/off toggle. */
export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        let muted = false
        try { muted = localStorage.getItem("iris.notify.muted") === "1" } catch { /* private mode */ }
        if ("Notification" in window && Notification.permission === "granted" && !muted) void ensurePushSubscription()
      })
      .catch(() => {})
  }, [])

  return null
}

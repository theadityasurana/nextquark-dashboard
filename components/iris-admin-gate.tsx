"use client"

import type { ReactNode } from "react"

/** JSON fetch for the Iris website admin routes; throws the server's error message. */
export async function irisAdminFetch(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) }, cache: "no-store" })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || "Something went wrong.")
  return data
}

/** Kept as a simple wrapper so screens stay the same; the dashboard needs no password. */
export function IrisAdminGate({ children }: { children: () => ReactNode }) {
  return <>{children()}</>
}

"use client"

import { useCallback, useLayoutEffect, useState, type ReactNode } from "react"
import useSWR, { SWRConfig } from "swr"

/**
 * Makes every tab paint its last data at once, then update.
 *
 * Tabs share SWR's cache for the session, and these routes are also kept in
 * localStorage so a reload or a new visit starts from them. Lists of people
 * (/api/users, the live queue, logs) are left out and stay in memory only.
 */

const PREFIX = "nq-cache:v1:"
const MAX_ENTRY_CHARS = 1_500_000
const MAX_AGE_MS = 7 * 24 * 60 * 60_000
const PERSISTED = /^\/api\/(overview|learning|analytics|appstore|companies|jobs|download-analytics|pricing)(\/|\?|$)|^\/api\/users\?funnel=1$/

export function isPersisted(url: string): boolean {
  return PERSISTED.test(url)
}

function readAll(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const storageKey = localStorage.key(i)
      if (!storageKey?.startsWith(PREFIX)) continue
      try {
        const { t, data } = JSON.parse(localStorage.getItem(storageKey) || "{}")
        if (Date.now() - t < MAX_AGE_MS) out[storageKey.slice(PREFIX.length)] = data
        else localStorage.removeItem(storageKey)
      } catch {
        localStorage.removeItem(storageKey)
      }
    }
  } catch {}
  return out
}

function persist(url: unknown, data: unknown): void {
  if (typeof url !== "string" || !isPersisted(url)) return
  const write = () => {
    try {
      const value = JSON.stringify({ t: Date.now(), data })
      const storageKey = PREFIX + url
      if (value.length > MAX_ENTRY_CHARS) return localStorage.removeItem(storageKey)
      try {
        localStorage.setItem(storageKey, value)
      } catch {
        // Storage is full: start again from this entry.
        Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k))
        localStorage.setItem(storageKey, value)
      }
    } catch {}
  }
  if ("requestIdleCallback" in window) requestIdleCallback(write)
  else setTimeout(write, 0)
}

export class ApiError extends Error {}

export async function fetchJson<T>(url: string, fresh = false): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: fresh ? { "x-nq-fresh": "1" } : undefined })
  const text = await res.text()
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiError(`HTTP ${res.status}${res.status === 504 ? " (timed out, database not responding)" : ""}`)
  }
  if (!res.ok || body?.error) throw new ApiError(body?.error || `HTTP ${res.status}`)
  return body as T
}

export function ApiCacheProvider({ children }: { children: ReactNode }) {
  const [fallback, setFallback] = useState<Record<string, unknown>>({})
  // Before paint, and after hydration so server and client first render alike.
  useLayoutEffect(() => setFallback(readAll()), [])
  return (
    <SWRConfig
      value={{
        fallback,
        revalidateOnFocus: false,
        errorRetryCount: 3,
        dedupingInterval: 5000,
        onSuccess: (data, key) => persist(key, data),
      }}
    >
      {children}
    </SWRConfig>
  )
}

/** A GET route's JSON. `isLoading` is only true when there is nothing at all to show. */
export function useApi<T>(url: string | null) {
  const swr = useSWR<T>(url, (u: string) => fetchJson<T>(u), { keepPreviousData: true })
  const { mutate } = swr
  const refresh = useCallback(async () => {
    if (!url) return
    await mutate(
      fetchJson<T>(url, true).then((data) => {
        persist(url, data)
        return data
      }),
      { revalidate: false, rollbackOnError: false, throwOnError: false },
    )
  }, [url, mutate])
  return {
    data: swr.data,
    error: swr.error as Error | undefined,
    isLoading: swr.isLoading && swr.data === undefined,
    isUpdating: swr.isValidating,
    refresh,
  }
}

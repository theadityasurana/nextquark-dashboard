"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Lock } from "lucide-react"

const STORE = "iris-admin-key"

/** The Iris website admin password, remembered in this browser. */
export function useIrisAdminKey() {
  const [key, setKey] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    try { setKey(localStorage.getItem(STORE)) } catch { /* private mode */ }
    setReady(true)
  }, [])
  const save = (k: string | null) => {
    try { if (k) localStorage.setItem(STORE, k); else localStorage.removeItem(STORE) } catch { /* private mode */ }
    setKey(k)
  }
  return { key, ready, save }
}

/** fetch() with the admin password; clears it (and asks again) if it's wrong. */
export async function irisAdminFetch(key: string, url: string, init: RequestInit = {}, onDenied?: () => void) {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", "x-admin-key": key, ...(init.headers || {}) }, cache: "no-store" })
  if (r.status === 401) { onDenied?.(); throw new Error("Wrong admin password.") }
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || "Something went wrong.")
  return data
}

export function IrisAdminGate({ children }: { children: (key: string, signOut: () => void) => ReactNode }) {
  const { key, ready, save } = useIrisAdminKey()
  const [draft, setDraft] = useState("")
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  if (!ready) return null
  if (key) return <>{children(key, () => save(null))}</>
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr("")
    try {
      await irisAdminFetch(draft.trim(), "/api/web-experiments")
      save(draft.trim())
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not check the password.")
    } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-md">
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" />Iris website admin</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-muted-foreground">Enter the referral-admin password from irisjobs.live. It is remembered in this browser.</p>
          <Input type="password" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Admin password" autoFocus />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={busy || !draft.trim()}>{busy ? "Checking…" : "Unlock"}</Button>
        </form>
      </CardContent>
    </Card>
  )
}

"use client"

// Browser → our own /api/remote-config routes. The browser never talks to
// Supabase for App Control and never sees the service key.
import type { ConfigRow, HistoryRow, Json, JsonObject } from "@/lib/remote-config/core"

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown> = {}) {
    super(message)
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } })
  } catch {
    throw new ApiError("Couldn't reach the server. Check your connection and try again.", 0)
  }
  let body: Record<string, unknown> = {}
  try {
    body = await res.json()
  } catch {
    if (!res.ok) throw new ApiError(`The server answered ${res.status} without details.`, res.status)
  }
  if (res.status === 429) throw new ApiError("Too many requests. Wait a minute and try again.", 429, body)
  if (!res.ok) throw new ApiError(typeof body.error === "string" ? body.error : `Request failed (${res.status}).`, res.status, body)
  return body as T
}

const enc = (key: string) => encodeURIComponent(key)
const post = <T,>(key: string, payload: object) =>
  call<T>(`/api/remote-config/${enc(key)}`, { method: "POST", body: JSON.stringify(payload) })

export type WriteResult = { row: ConfigRow; changed: boolean }

export const rcApi = {
  all: () => call<ConfigRow[]>("/api/remote-config"),
  one: (key: string) => call<ConfigRow>(`/api/remote-config/${enc(key)}`),
  history: (key: string) => call<HistoryRow[]>(`/api/remote-config/${enc(key)}/history`),
  validate: (key: string, value: JsonObject) => post<{ problems: string[] }>(key, { action: "validate", value }),
  set: (key: string, value: JsonObject, note: string, expectedVersion: number) =>
    post<WriteResult>(key, { action: "set", value, note, expectedVersion }),
  field: (key: string, path: string[], value: Json, note: string, expectedVersion: number) =>
    post<WriteResult>(key, { action: "field", path, value, note, expectedVersion }),
  reset: (key: string, note: string, expectedVersion: number) => post<WriteResult>(key, { action: "reset", note, expectedVersion }),
  rollback: (key: string, version: number, note: string, expectedVersion: number) =>
    post<WriteResult>(key, { action: "rollback", version, note, expectedVersion }),
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong."
}

import { after } from "next/server"

/**
 * In-process cache for expensive GET routes.
 *
 * Within the TTL a response comes straight from memory. After it, the old response
 * is returned immediately and refreshed in the background. If Supabase fails, the
 * last good response keeps being served, so a 520 or 521 from its gateway doesn't
 * blank a dashboard tab.
 */

interface Entry {
  body: unknown
  storedAt: number
}

/** Past this age a response is too old to show, so the request waits for a new one. */
const MAX_STALE_MS = 15 * 60_000

const entries = new Map<string, Entry>()
const inFlight = new Map<string, Promise<unknown>>()

type Handler = () => Promise<Response>

const hasErrorBody = (body: unknown) => !!(body && typeof body === "object" && "error" in body && (body as { error: unknown }).error)

function runLoad(key: string, handler: Handler): Promise<unknown> {
  const running = inFlight.get(key)
  if (running) return running
  const load = (async () => {
    const res = await handler()
    const body = await res.clone().json().catch(() => undefined)
    if (!res.ok || body === undefined || hasErrorBody(body)) throw new RouteFailure(res, body)
    entries.set(key, { body, storedAt: Date.now() })
    return body
  })().finally(() => inFlight.delete(key))
  inFlight.set(key, load)
  return load
}

class RouteFailure extends Error {
  constructor(
    readonly response: Response,
    readonly body: unknown,
  ) {
    super(`route answered ${response.status}`)
  }
}

const respond = (body: unknown, state: string) => Response.json(body, { headers: { "x-nq-cache": state } })

/** Serves a GET route through the cache. The x-nq-fresh header skips it, for Refresh buttons. */
export async function cachedRoute(request: Request, ttlMs: number, handler: Handler): Promise<Response> {
  const url = new URL(request.url)
  const key = url.pathname + url.search
  const entry = entries.get(key)
  const age = entry ? Date.now() - entry.storedAt : Infinity
  const force = request.headers.get("x-nq-fresh") === "1"

  if (entry && !force) {
    if (age < ttlMs) return respond(entry.body, "hit")
    if (age < MAX_STALE_MS) {
      const refresh = runLoad(key, handler).catch(() => {})
      try {
        // Keeps a serverless function alive until the refresh is stored.
        after(() => refresh)
      } catch {}
      return respond(entry.body, "stale")
    }
  }

  try {
    return respond(await runLoad(key, handler), "miss")
  } catch (err) {
    if (entry) return respond(entry.body, "stale-after-error")
    if (err instanceof RouteFailure) return err.response
    throw err
  }
}

/** The same idea for one value inside a route: fresh within the TTL, last good value on failure. */
export async function cachedValue<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const entry = entries.get(key)
  if (entry && Date.now() - entry.storedAt < ttlMs) return entry.body as T
  try {
    const running = (inFlight.get(key) as Promise<T> | undefined) ?? load()
    inFlight.set(key, running)
    const body = await running.finally(() => inFlight.delete(key))
    entries.set(key, { body, storedAt: Date.now() })
    return body
  } catch (err) {
    if (entry) return entry.body as T
    throw err
  }
}

export function clearServerCache(): void {
  entries.clear()
  inFlight.clear()
}

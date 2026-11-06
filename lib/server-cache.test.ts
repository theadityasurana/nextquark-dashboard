import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { cachedRoute, cachedValue, clearServerCache } from "./server-cache"

const req = (path = "/api/x", headers: Record<string, string> = {}) => new Request(`http://t${path}`, { headers })
const ok = (body: unknown) => async () => Response.json(body)

beforeEach(() => {
  clearServerCache()
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe("cachedRoute", () => {
  it("serves from memory within the TTL", async () => {
    const handler = vi.fn(ok({ n: 1 }))
    await cachedRoute(req(), 1000, handler)
    const res = await cachedRoute(req(), 1000, handler)
    expect(res.headers.get("x-nq-cache")).toBe("hit")
    expect(await res.json()).toEqual({ n: 1 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("keeps query strings apart, so 30d and all time differ", async () => {
    await cachedRoute(req("/api/x?range=30d"), 1000, ok({ r: "30d" }))
    const res = await cachedRoute(req("/api/x?range=all"), 1000, ok({ r: "all" }))
    expect(await res.json()).toEqual({ r: "all" })
  })

  it("answers with the old body after the TTL and refreshes behind it", async () => {
    await cachedRoute(req(), 1000, ok({ n: 1 }))
    vi.advanceTimersByTime(1001)
    const res = await cachedRoute(req(), 1000, ok({ n: 2 }))
    expect(res.headers.get("x-nq-cache")).toBe("stale")
    expect(await res.json()).toEqual({ n: 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(await (await cachedRoute(req(), 1000, ok({ n: 3 }))).json()).toEqual({ n: 2 })
  })

  it("skips the cache when asked for fresh data", async () => {
    await cachedRoute(req(), 1000, ok({ n: 1 }))
    const res = await cachedRoute(req("/api/x", { "x-nq-fresh": "1" }), 1000, ok({ n: 2 }))
    expect(await res.json()).toEqual({ n: 2 })
  })

  it("serves the last good body when the database fails", async () => {
    await cachedRoute(req(), 1000, ok({ n: 1 }))
    const res = await cachedRoute(req("/api/x", { "x-nq-fresh": "1" }), 1000, async () => Response.json({ error: "521" }, { status: 500 }))
    expect(res.headers.get("x-nq-cache")).toBe("stale-after-error")
    expect(await res.json()).toEqual({ n: 1 })
  })

  it("never stores a failure, and passes it on when there is nothing to fall back to", async () => {
    const res = await cachedRoute(req(), 1000, async () => Response.json({ error: "down" }, { status: 500 }))
    expect(res.status).toBe(500)
    expect(await (await cachedRoute(req(), 1000, ok({ n: 1 }))).json()).toEqual({ n: 1 })
  })

  it("treats an error in a 200 body as a failure", async () => {
    await cachedRoute(req(), 1000, async () => Response.json({ error: "no table" }))
    expect(await (await cachedRoute(req(), 1000, ok({ error: null, n: 1 }))).json()).toEqual({ error: null, n: 1 })
  })

  it("makes one database call for simultaneous requests", async () => {
    const handler = vi.fn(ok({ n: 1 }))
    await Promise.all([cachedRoute(req(), 1000, handler), cachedRoute(req(), 1000, handler), cachedRoute(req(), 1000, handler)])
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe("cachedValue", () => {
  it("reuses a value and falls back to it on failure", async () => {
    expect(await cachedValue("k", 1000, async () => 1)).toBe(1)
    expect(await cachedValue("k", 1000, async () => 2)).toBe(1)
    vi.advanceTimersByTime(1001)
    expect(await cachedValue("k", 1000, async () => { throw new Error("521") })).toBe(1)
  })
})

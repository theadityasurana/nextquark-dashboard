import { describe, expect, it } from "vitest"
import {
  decide,
  DEFAULT_BREAKER_CONFIG,
  healthLabel,
  initBreaker,
  transition,
  type BreakerRecord,
} from "./circuit-breaker"

const T0 = new Date("2026-08-23T10:00:00.000Z")
const at = (mins: number) => new Date(T0.getTime() + mins * 60_000)

const cfg = DEFAULT_BREAKER_CONFIG

/** Drive a fresh breaker to open with `n` consecutive failures. */
function failTimes(n: number, now = T0): BreakerRecord {
  let r = initBreaker("Greenhouse")
  for (let i = 0; i < n; i++) r = transition(r, { success: false, error: "selector timeout" }, cfg, now)
  return r
}

describe("initBreaker", () => {
  it("starts closed and clean", () => {
    const r = initBreaker("Lever")
    expect(r.state).toBe("closed")
    expect(r.consecutiveFailures).toBe(0)
    expect(r.openedAt).toBeNull()
  })
})

describe("transition", () => {
  it("counts failures without opening below the threshold", () => {
    const r = failTimes(cfg.threshold - 1)
    expect(r.state).toBe("closed")
    expect(r.consecutiveFailures).toBe(cfg.threshold - 1)
  })

  it("opens at the threshold and stamps openedAt", () => {
    const r = failTimes(cfg.threshold)
    expect(r.state).toBe("open")
    expect(r.openedAt).toBe(T0.toISOString())
    expect(r.lastError).toBe("selector timeout")
  })

  it("a success resets the count and closes the breaker", () => {
    const opened = failTimes(cfg.threshold)
    const r = transition(opened, { success: true }, cfg, at(1))
    expect(r.state).toBe("closed")
    expect(r.consecutiveFailures).toBe(0)
    expect(r.openedAt).toBeNull()
    expect(r.lastError).toBeNull()
  })

  it("a single success mid-streak clears the count", () => {
    let r = failTimes(cfg.threshold - 1)
    r = transition(r, { success: true }, cfg, at(1))
    expect(r.consecutiveFailures).toBe(0)
    r = transition(r, { success: false, error: "x" }, cfg, at(2))
    expect(r.state).toBe("closed")
  })

  it("a failed probe re-opens immediately without re-accumulating", () => {
    const opened = failTimes(cfg.threshold)
    const { record: halfOpen } = decide(opened, cfg, at(11))
    expect(halfOpen.state).toBe("halfOpen")

    const reopened = transition(halfOpen, { success: false, error: "still down" }, cfg, at(11))
    expect(reopened.state).toBe("open")
    // Fresh cooldown clock, not the original open time.
    expect(reopened.openedAt).toBe(at(11).toISOString())
  })

  it("a successful probe fully closes the breaker", () => {
    const opened = failTimes(cfg.threshold)
    const { record: halfOpen } = decide(opened, cfg, at(11))
    const closed = transition(halfOpen, { success: true }, cfg, at(11))
    expect(closed.state).toBe("closed")
    expect(closed.consecutiveFailures).toBe(0)
  })

  it("keeps the original openedAt while already open", () => {
    let r = failTimes(cfg.threshold)
    r = transition(r, { success: false, error: "again" }, cfg, at(5))
    expect(r.openedAt).toBe(T0.toISOString())
    expect(r.consecutiveFailures).toBe(cfg.threshold + 1)
  })
})

describe("decide", () => {
  it("allows everything while closed", () => {
    expect(decide(initBreaker("Ashby"), cfg, T0).allow).toBe(true)
  })

  it("refuses while open and reports the retry delay", () => {
    const opened = failTimes(cfg.threshold)
    const d = decide(opened, cfg, at(2))
    expect(d.allow).toBe(false)
    expect(d.reason).toContain("breaker is open")
    expect(d.retryInMs).toBe(8 * 60_000)
  })

  it("admits exactly one probe once the cooldown elapses", () => {
    const opened = failTimes(cfg.threshold)
    const d = decide(opened, cfg, at(10))
    expect(d.allow).toBe(true)
    // The caller must persist this so the *next* asker doesn't also get through.
    expect(d.record.state).toBe("halfOpen")
  })

  it("allows the in-flight probe when already half-open", () => {
    const opened = failTimes(cfg.threshold)
    const { record: halfOpen } = decide(opened, cfg, at(11))
    expect(decide(halfOpen, cfg, at(11)).allow).toBe(true)
  })

  it("treats a missing openedAt as long expired rather than blocking forever", () => {
    const broken: BreakerRecord = { ...initBreaker("Workday"), state: "open", openedAt: null }
    expect(decide(broken, cfg, T0).allow).toBe(true)
  })
})

describe("healthLabel", () => {
  it("reports healthy when clean", () => {
    expect(healthLabel(initBreaker("Lever"), cfg, T0)).toEqual({ label: "healthy", tone: "ok" })
  })

  it("reports degraded on a partial failure streak", () => {
    const r = failTimes(1)
    expect(healthLabel(r, cfg, T0).tone).toBe("degraded")
    expect(healthLabel(r, cfg, T0).label).toContain("1 recent failure")
  })

  it("reports paused with a countdown while open", () => {
    const opened = failTimes(cfg.threshold)
    const h = healthLabel(opened, cfg, at(3))
    expect(h.tone).toBe("down")
    expect(h.label).toContain("retry in 7m")
  })

  it("reports probing while half-open", () => {
    const opened = failTimes(cfg.threshold)
    const { record: halfOpen } = decide(opened, cfg, at(11))
    expect(healthLabel(halfOpen, cfg, at(11)).tone).toBe("degraded")
  })
})

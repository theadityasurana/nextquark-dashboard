import { describe, expect, it, vi } from "vitest"
import {
  activeStep,
  applyEvent,
  initTimeline,
  RunTracker,
  RUN_STEPS,
  summarize,
  type RunTimeline,
} from "./run-timeline"

const T0 = "2026-08-22T10:00:00.000Z"
const T1 = "2026-08-22T10:00:05.000Z"
const T2 = "2026-08-22T10:00:12.000Z"

function step(t: RunTimeline, id: string) {
  const s = t.steps.find((x) => x.id === id)
  if (!s) throw new Error(`no step ${id}`)
  return s
}

describe("initTimeline", () => {
  it("starts every canonical step pending", () => {
    const t = initTimeline(T0)
    expect(t.steps).toHaveLength(RUN_STEPS.length)
    expect(t.steps.every((s) => s.status === "pending")).toBe(true)
    expect(t.failedStep).toBeNull()
    expect(t.endedAt).toBeNull()
  })
})

describe("applyEvent", () => {
  it("is pure — the input timeline is not mutated", () => {
    const t = initTimeline(T0)
    const next = applyEvent(t, { type: "begin", step: "session", at: T0 })
    expect(step(t, "session").status).toBe("pending")
    expect(step(next, "session").status).toBe("running")
  })

  it("records duration on success", () => {
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "begin", step: "navigate", at: T0 })
    t = applyEvent(t, { type: "succeed", step: "navigate", detail: "settled", at: T1 })
    const s = step(t, "navigate")
    expect(s.status).toBe("success")
    expect(s.durationMs).toBe(5000)
    expect(s.detail).toBe("settled")
  })

  it("leaves duration null when a step ends without having begun", () => {
    const t = applyEvent(initTimeline(T0), { type: "succeed", step: "audit", at: T1 })
    expect(step(t, "audit").durationMs).toBeNull()
  })

  it("records the first failure as the run's failedStep", () => {
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "fail", step: "prefill", error: "selector timeout", at: T1 })
    t = applyEvent(t, { type: "fail", step: "submit", error: "no button", at: T2 })
    expect(t.failedStep).toBe("prefill")
    expect(step(t, "submit").error).toBe("no button")
  })

  it("re-opens a step on a second begin, clearing the stale verdict", () => {
    // The driver legitimately retries submit after fixing validation errors.
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "begin", step: "submit", at: T0 })
    t = applyEvent(t, { type: "fail", step: "submit", error: "validation", at: T1 })
    t = applyEvent(t, { type: "begin", step: "submit", at: T1 })
    const s = step(t, "submit")
    expect(s.status).toBe("running")
    expect(s.error).toBeNull()
    expect(s.endedAt).toBeNull()
    // The run still remembers that submit was the first thing to fail.
    expect(t.failedStep).toBe("submit")
  })

  it("marks a skipped step without a duration", () => {
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "skip", step: "verification", detail: "no CAPTCHA", at: T1 })
    const s = step(t, "verification")
    expect(s.status).toBe("skipped")
    expect(s.durationMs).toBeNull()
    expect(s.detail).toBe("no CAPTCHA")
  })
})

describe("screenshot attribution", () => {
  it("attaches screenshots to the running step", () => {
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "begin", step: "ai_fill", at: T0 })
    t = applyEvent(t, { type: "screenshot", url: "https://x/1.png" })
    expect(step(t, "ai_fill").screenshots).toEqual(["https://x/1.png"])
  })

  it("drops screenshots captured with no step open rather than mis-attributing", () => {
    const t = applyEvent(initTimeline(T0), { type: "screenshot", url: "https://x/1.png" })
    expect(t.steps.every((s) => s.screenshots.length === 0)).toBe(true)
  })

  it("dedupes a repeated screenshot url", () => {
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "begin", step: "ai_fill", at: T0 })
    t = applyEvent(t, { type: "screenshot", url: "https://x/1.png" })
    t = applyEvent(t, { type: "screenshot", url: "https://x/1.png" })
    expect(step(t, "ai_fill").screenshots).toHaveLength(1)
  })

  it("follows the active step as the run advances", () => {
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "begin", step: "prefill", at: T0 })
    t = applyEvent(t, { type: "screenshot", url: "https://x/a.png" })
    t = applyEvent(t, { type: "succeed", step: "prefill", at: T1 })
    t = applyEvent(t, { type: "begin", step: "submit", at: T1 })
    t = applyEvent(t, { type: "screenshot", url: "https://x/b.png" })
    expect(step(t, "prefill").screenshots).toEqual(["https://x/a.png"])
    expect(step(t, "submit").screenshots).toEqual(["https://x/b.png"])
  })
})

describe("activeStep", () => {
  it("returns null when nothing is running", () => {
    expect(activeStep(initTimeline(T0))).toBeNull()
  })

  it("returns the open step", () => {
    const t = applyEvent(initTimeline(T0), { type: "begin", step: "audit", at: T0 })
    expect(activeStep(t)?.id).toBe("audit")
  })
})

describe("end", () => {
  it("fails any step still open, so a crashed run has no phantom 'running'", () => {
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "begin", step: "ai_fill", at: T0 })
    t = applyEvent(t, { type: "end", at: T2 })
    const s = step(t, "ai_fill")
    expect(s.status).toBe("failed")
    expect(s.error).toMatch(/still in progress/)
    expect(s.durationMs).toBe(12000)
    expect(t.endedAt).toBe(T2)
  })

  it("leaves settled steps alone", () => {
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "begin", step: "navigate", at: T0 })
    t = applyEvent(t, { type: "succeed", step: "navigate", at: T1 })
    t = applyEvent(t, { type: "end", at: T2 })
    expect(step(t, "navigate").status).toBe("success")
    expect(step(t, "navigate").durationMs).toBe(5000)
  })
})

describe("confirmation and validation errors", () => {
  it("stores a confirmation id and its confidence", () => {
    const t = applyEvent(initTimeline(T0), {
      type: "confirmation",
      id: "R-1043928",
      confidence: "high",
    })
    expect(t.confirmationId).toBe("R-1043928")
    expect(t.confirmationConfidence).toBe("high")
  })

  it("stores form-reported validation errors", () => {
    const t = applyEvent(initTimeline(T0), {
      type: "validationErrors",
      errors: ["Phone is required", "Select a location"],
    })
    expect(t.validationErrors).toHaveLength(2)
  })
})

describe("summarize", () => {
  it("counts each status and the wall-clock total", () => {
    let t = initTimeline(T0)
    t = applyEvent(t, { type: "begin", step: "session", at: T0 })
    t = applyEvent(t, { type: "succeed", step: "session", at: T1 })
    t = applyEvent(t, { type: "skip", step: "verification", at: T1 })
    t = applyEvent(t, { type: "fail", step: "submit", error: "boom", at: T2 })
    t = applyEvent(t, { type: "end", at: T2 })

    const s = summarize(t)
    expect(s.total).toBe(RUN_STEPS.length)
    expect(s.completed).toBe(1)
    expect(s.skipped).toBe(1)
    expect(s.failed).toBe(1)
    expect(s.attempted).toBe(3)
    expect(s.failedStep).toBe("submit")
    expect(s.totalMs).toBe(12000)
  })

  it("reports a null total while the run is still open", () => {
    expect(summarize(initTimeline(T0)).totalMs).toBeNull()
  })
})

describe("RunTracker", () => {
  it("debounces writes and flushes the latest state once", async () => {
    vi.useFakeTimers()
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = new RunTracker(persist, 1500)

    tracker.begin("session")
    tracker.succeed("session", "created")
    tracker.begin("navigate")
    expect(persist).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1500)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(step(persist.mock.calls[0][0], "session").detail).toBe("created")

    vi.useRealTimers()
  })

  it("does not re-write when nothing changed since the last flush", async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = new RunTracker(persist, 10)
    tracker.begin("session")
    await tracker.flush()
    await tracker.flush()
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it("swallows persistence failures so telemetry can never fail a run", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("supabase down"))
    const tracker = new RunTracker(persist, 10)
    tracker.begin("session")
    await expect(tracker.flush()).resolves.toBeUndefined()
  })

  it("end() closes the run and forces a final write", async () => {
    const persist = vi.fn().mockResolvedValue(undefined)
    const tracker = new RunTracker(persist, 100_000)
    tracker.begin("session")
    const final = await tracker.end()
    expect(final.endedAt).not.toBeNull()
    expect(persist).toHaveBeenCalledTimes(1)
    expect(step(final, "session").status).toBe("failed")
  })
})

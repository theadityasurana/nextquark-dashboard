import { describe, it, expect } from "vitest"
import { runSeconds, runCost, formatCost, summarizeCost, KERNEL_RATES } from "./run-cost"

describe("runSeconds", () => {
  it("prefers the measured processing time", () => {
    expect(runSeconds({ processing_time_ms: 121200 })).toBeCloseTo(121.2, 3)
  })

  it("falls back to the timestamps on older rows", () => {
    expect(runSeconds({
      started_at: "2026-08-30T10:00:00Z",
      completed_at: "2026-08-30T10:02:00Z",
    })).toBe(120)
  })

  // Null, not zero: an unfinished run has no cost YET, and "$0.00" would read as
  // free rather than unknown.
  it("returns null when the duration is unknowable", () => {
    expect(runSeconds({})).toBeNull()
    expect(runSeconds({ processing_time_ms: 0 })).toBeNull()
    expect(runSeconds({ started_at: "2026-08-30T10:00:00Z" })).toBeNull()
    expect(runSeconds({ started_at: "x", completed_at: "y" })).toBeNull()
  })

  // A row in the real table spans 11.8 hours: queue wait plus an OTP the
  // candidate had to supply. That is not browser time, and billing it as such
  // reported $5.68 for a single application.
  it("rejects a span longer than a session could possibly live", () => {
    expect(runSeconds({
      started_at: "2026-08-30T00:00:00Z",
      completed_at: "2026-08-30T11:49:57Z",
    })).toBeNull()
  })

  it("still accepts a long but plausible run", () => {
    expect(runSeconds({
      started_at: "2026-08-30T10:00:00Z",
      completed_at: "2026-08-30T10:10:00Z",
    })).toBe(600)
  })

  it("ignores a completion that precedes the start", () => {
    expect(runSeconds({
      started_at: "2026-08-30T10:02:00Z",
      completed_at: "2026-08-30T10:00:00Z",
    })).toBeNull()
  })
})

describe("runCost", () => {
  // A real run: the Speechify submission measured 121.2s of headful browser time.
  it("prices a real run at the headful rate", () => {
    const cost = runCost({ processing_time_ms: 121200 })!
    expect(cost).toBeCloseTo(121.2 * KERNEL_RATES.headful, 8)
    expect(cost).toBeCloseTo(0.01616, 4)
  })

  it("prices headless at an eighth and GPU at six times headful", () => {
    const secs = { processing_time_ms: 60000 }
    expect(runCost(secs, "headless")!).toBeCloseTo(runCost(secs)! / 8, 6)
    expect(runCost(secs, "gpu")!).toBeGreaterThan(runCost(secs)! * 5)
  })

  it("has no cost without a duration", () => {
    expect(runCost({})).toBeNull()
  })
})

describe("formatCost", () => {
  // At $0.008/min most runs are sub-cent, so two decimals would render "$0.00"
  // for nearly everything and imply the work was free.
  it("keeps sub-cent runs legible", () => {
    expect(formatCost(0.01616)).toBe("$0.016")
    expect(formatCost(0.0042)).toBe("$0.0042")
    expect(formatCost(1.5)).toBe("$1.50")
  })

  it("shows a dash rather than a zero when the cost is unknown", () => {
    expect(formatCost(null)).toBe("—")
    expect(formatCost(undefined)).toBe("—")
    expect(formatCost(Number.NaN)).toBe("—")
  })
})

describe("summarizeCost", () => {
  const rows = [
    { processing_time_ms: 120000 },
    { processing_time_ms: 60000 },
    { processing_time_ms: null },          // queued, never ran
    { started_at: "2026-08-30T10:00:00Z", completed_at: "2026-08-30T10:00:30Z" },
  ]

  it("totals only the runs that actually consumed browser time", () => {
    const s = summarizeCost(rows)
    expect(s.billedRuns).toBe(3)
    expect(s.totalSeconds).toBe(210)
    expect(s.totalCost).toBeCloseTo(210 * KERNEL_RATES.headful, 8)
  })

  // The divisor excludes rows that never ran; counting them would understate
  // what an application actually costs.
  it("averages over billed runs, not over every row", () => {
    const s = summarizeCost(rows)
    expect(s.costPerApplication).toBeCloseTo(s.totalCost / 3, 8)
    expect(s.averageSeconds).toBe(70)
  })

  it("is safe on an empty or missing list", () => {
    expect(summarizeCost([]).costPerApplication).toBe(0)
    expect(summarizeCost(undefined as any).totalCost).toBe(0)
  })
})

import { describe, expect, it } from "vitest"
import { effectiveConcurrency, MAX_REASONABLE_CONCURRENCY } from "./kernel-limits"

describe("effectiveConcurrency", () => {
  it("claims most of the plan but leaves headroom for anything else on the account", () => {
    // The org limit covers every browser on the account, not just this app.
    // Claiming all of it means the first unrelated session pushes us over.
    const d = effectiveConcurrency(4)
    expect(d.limit).toBe(3)
    expect(d.orgLimit).toBe(4)
  })

  it("caps generous plans, because volume from one account is itself a bot signal", () => {
    const d = effectiveConcurrency(40)
    expect(d.limit).toBe(MAX_REASONABLE_CONCURRENCY)
    expect(d.reason).toMatch(/capped/i)
  })

  it("runs one at a time on a single-browser plan", () => {
    expect(effectiveConcurrency(1).limit).toBe(1)
    expect(effectiveConcurrency(2).limit).toBe(1)
  })

  it("is timid when the limit could not be read", () => {
    // Being slow is recoverable. Being rejected mid-run is not.
    const d = effectiveConcurrency(null)
    expect(d.limit).toBe(2)
    expect(d.orgLimit).toBeNull()
    expect(d.reason).toMatch(/could not read/i)
  })

  it("honours an operator override", () => {
    const d = effectiveConcurrency(20, 3)
    expect(d.limit).toBe(3)
  })

  it("still caps an override — the cap is about looking human, not capacity", () => {
    const d = effectiveConcurrency(50, 25)
    expect(d.limit).toBe(MAX_REASONABLE_CONCURRENCY)
    expect(d.reason).toMatch(/capped/i)
  })

  it("ignores a zero or negative override", () => {
    expect(effectiveConcurrency(8, 0).limit).toBe(MAX_REASONABLE_CONCURRENCY)
    expect(effectiveConcurrency(8, -2).limit).toBe(MAX_REASONABLE_CONCURRENCY)
  })

  it("never returns less than one", () => {
    for (const org of [0, 1, 2, 3, null]) {
      expect(effectiveConcurrency(org as number | null).limit).toBeGreaterThanOrEqual(1)
    }
  })

  it("always explains itself, so the choice is visible in the log", () => {
    for (const org of [null, 1, 4, 40]) {
      expect(effectiveConcurrency(org as number | null).reason.length).toBeGreaterThan(20)
    }
  })
})

import { describe, it, expect } from "vitest"
import { finishTiming, recordTiming, unwrapVmTimer, withVmTimer } from "./run-timing"

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

describe("withVmTimer", () => {
  it("keeps the script's return value and adds its VM time", async () => {
    const out = await new AsyncFunction("page", withVmTimer("return { a: await page.get() };"))({ get: async () => 7 })
    const { result, vmMs } = unwrapVmTimer(out)
    expect(result).toEqual({ a: 7 })
    expect(vmMs).toBeGreaterThanOrEqual(0)
  })

  it("handles a script with no return", async () => {
    const { result } = unwrapVmTimer(await new AsyncFunction(withVmTimer("const x = 1;"))())
    expect(result).toBeUndefined()
  })

  it("lets a script's error through", async () => {
    await expect(new AsyncFunction(withVmTimer("throw new Error('boom');"))()).rejects.toThrow("boom")
  })
})

describe("unwrapVmTimer", () => {
  it("leaves other results untouched", () => {
    expect(unwrapVmTimer({ a: 1 })).toEqual({ result: { a: 1 }, vmMs: null })
    expect(unwrapVmTimer(null)).toEqual({ result: null, vmMs: null })
  })
})

describe("finishTiming", () => {
  it("splits script time into VM and waiting", () => {
    recordTiming("run-1", "script", 10_000, 1_000)
    recordTiming("run-1", "script", 20_000, 2_000)
    recordTiming("run-1", "llm", 3_000)
    const line = finishTiming("run-1")
    expect(line).toContain("scripts 2x 30s (max 20s)")
    expect(line).toContain("VM 3s, API/network wait 27s")
    expect(line).toContain("llm 1x 3s")
    expect(line).toContain("stagehand 0x")
  })

  it("forgets the run afterwards", () => {
    recordTiming("run-2", "dbLog", 5_000)
    finishTiming("run-2")
    expect(finishTiming("run-2")).toContain("dbLog 0x")
  })
})

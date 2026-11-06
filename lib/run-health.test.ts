import { describe, it, expect } from "vitest"
import { summarizeRunLogs } from "./run-health"

const log = (application_id: string, message: string) => ({ application_id, message })

describe("summarizeRunLogs", () => {
  it("counts outcomes per run", () => {
    const h = summarizeRunLogs([
      log("a", "[Result] COMPLETED | attempt 1/3 | 100s"),
      log("b", "[Kernel] [Result] PENDING | attempt 1/3 | 90s"),
      log("c", "[Result] COMPLETED | attempt 1/3 | 80s"),
    ])
    expect(h.results).toEqual({ COMPLETED: 2, PENDING: 1 })
    expect(h.runs).toBe(3)
  })

  it("ranks failing fields by applications, not by log lines", () => {
    const h = summarizeRunLogs([
      log("a", '[Kernel] NOT FILLED "School" via typeahead: no-options-rendered'),
      log("a", '[Kernel] NOT FILLED "School" via typeahead: no-options-rendered'),
      log("b", '[Kernel] NOT FILLED "Phone" via text: element-not-found'),
      log("c", '[Kernel] NOT FILLED "Phone" via text: element-not-found'),
    ])
    expect(h.fieldFailures[0]).toEqual({ field: "Phone", reason: "element-not-found", applications: 2 })
    expect(h.fieldFailures[1].applications).toBe(1)
  })

  it("does not count the routine step of reading a dropdown's options", () => {
    const h = summarizeRunLogs([log("a", 'NOT FILLED "Degree" via typeahead: no-matching-option | widget offered: x')])
    expect(h.fieldFailures).toEqual([])
  })

  it("reads form rejections and last-resort answers", () => {
    const h = summarizeRunLogs([
      log("a", "Post-submit validation errors: Phone — running targeted retry"),
      log("a", '[Answer] last-resort answer for "LinkedIn Profile": "https://x"'),
    ])
    expect(h.rejections).toEqual([{ reason: "Phone", applications: 1 }])
    expect(h.lastResort).toEqual([{ field: "LinkedIn Profile", applications: 1 }])
  })

  it("totals wasted writes from the refill summaries", () => {
    const h = summarizeRunLogs([
      log("a", "[Refill] summary: 10 fields written, 2 more than once, 13 writes in total"),
      log("b", "[Refill] summary: 8 fields written, 0 more than once, 8 writes in total"),
    ])
    expect(h.refills).toEqual({ runsMeasured: 2, runsWithRefills: 1, extraWrites: 3 })
  })

  it("ignores lines with no application", () => {
    expect(summarizeRunLogs([{ application_id: null, message: "[Result] COMPLETED" }]).runs).toBe(0)
  })
})

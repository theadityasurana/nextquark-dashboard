import { describe, expect, it } from "vitest"
import { spreadPins } from "./pin-spread"

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

describe("spreadPins", () => {
  it("leaves pins that don't overlap where they are", () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 100 }]
    expect(spreadPins(pts)).toEqual(pts)
  })

  it("fans out 100 pins on the same pixel so no two dots coincide", () => {
    const pts = Array.from({ length: 100 }, () => ({ x: 400, y: 300 }))
    const out = spreadPins(pts, 8, 5)
    let minGap = Infinity
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) minGap = Math.min(minGap, dist(out[i], out[j]))
    expect(minGap).toBeGreaterThan(3.5)
    // and the group stays compact around the real spot
    expect(Math.max(...out.map((p) => dist(p, { x: 400, y: 300 })))).toBeLessThan(60)
  })

  it("keeps the input order, one output per input", () => {
    const pts = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 500, y: 500 }]
    const out = spreadPins(pts)
    expect(out).toHaveLength(3)
    expect(out[2]).toEqual({ x: 500, y: 500 })
  })
})

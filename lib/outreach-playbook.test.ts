import { describe, expect, it } from "vitest"
import { fillName, NO_PITCH_STAGES, PLAYBOOK, PRICES } from "./outreach-playbook"

describe("reply playbook", () => {
  const steps = PLAYBOOK.flatMap((s) => s.steps)

  it("quotes real per-application prices from the plan catalog", () => {
    expect(PRICES.lowestPerApp).toBe("₹4")
    expect(PRICES.starter.monthly).toBe("₹499")
    expect(PRICES.pro.perAppQ).toBe("₹4")
  })

  it("every next link points at a real step, and ids are unique", () => {
    const ids = new Set(steps.map((s) => s.id))
    expect(ids.size).toBe(steps.length)
    for (const s of steps) for (const n of s.next ?? []) expect(ids.has(n.to), `${s.id} -> ${n.to}`).toBe(true)
  })

  it("messages are short and personalisable", () => {
    for (const s of steps) {
      expect(s.message.split(/\s+/).length, s.id).toBeLessThanOrEqual(110)
      expect(s.message, s.id).toContain("[Name]")
      expect(s.message, s.id).not.toMatch(/—/)
    }
  })

  it("the first stages stay conversational: no premium, plans, or price", () => {
    for (const stage of PLAYBOOK.slice(0, NO_PITCH_STAGES)) {
      for (const s of stage.steps) expect(s.message, s.id).not.toMatch(/premium|plan|price|₹|\$|upgrade|pay/i)
    }
  })

  it("fills the name everywhere and leaves the placeholder when blank", () => {
    expect(fillName("Hi [Name], bye [Name]", "Riya")).toBe("Hi Riya, bye Riya")
    expect(fillName("Hi [Name]", "  ")).toBe("Hi [Name]")
  })
})

import { describe, it, expect } from "vitest"
import { cooldownSeconds, LlmLimiter } from "./llm-limiter"

function limiterAt(start = 1_000_000) {
  const clock = { t: start }
  return { clock, limiter: new LlmLimiter(() => clock.t) }
}

describe("cooldownSeconds", () => {
  it("rests a model for an hour on a daily quota or missing credit", () => {
    expect(cooldownSeconds("GenerateRequestsPerDayPerProjectPerModel-FreeTier")).toBe(3600)
    expect(cooldownSeconds("This request requires more credits")).toBe(3600)
  })
  it("honours the wait a provider states", () => {
    expect(cooldownSeconds("Please retry in 16.2s")).toBe(18)
    expect(cooldownSeconds("Please try again in 1m2s")).toBe(63)
  })
  it("falls back to a short rest", () => {
    expect(cooldownSeconds("HTTP 429")).toBe(30)
  })
})

describe("LlmLimiter", () => {
  it("caps concurrent calls and frees the slot on release", () => {
    const { limiter } = limiterAt()
    const held = [1, 2, 3].map(() => limiter.tryStart("m", "groq", 10))
    expect(held.every(Boolean)).toBe(true)
    expect(limiter.tryStart("m", "groq", 10)).toBeNull()
    held[0]!()
    held[0]!() // releasing twice must not free two slots
    expect(limiter.tryStart("m", "groq", 10)).not.toBeNull()
    expect(limiter.tryStart("m", "groq", 10)).toBeNull()
  })

  it("stops at the per-minute token budget and recovers after the window", () => {
    const { limiter, clock } = limiterAt()
    limiter.tryStart("m", "groq", 7000)!()
    expect(limiter.tryStart("m", "groq", 2000)).toBeNull()
    clock.t += 61_000
    expect(limiter.tryStart("m", "groq", 2000)).not.toBeNull()
  })

  it("lets an idle model take a prompt larger than its budget", () => {
    const { limiter } = limiterAt()
    expect(limiter.tryStart("m", "groq", 50_000)).not.toBeNull()
  })

  it("keeps other models available when one is limited", () => {
    const { limiter } = limiterAt()
    limiter.noteRateLimited("a", "HTTP 429")
    expect(limiter.tryStart("a", "groq", 10)).toBeNull()
    expect(limiter.tryStart("b", "groq", 10)).not.toBeNull()
  })

  it("shares one request budget across OpenRouter's free models", () => {
    const { limiter } = limiterAt()
    for (let i = 0; i < 18; i++) limiter.tryStart(`free-${i}`, "openrouter", 10)!()
    expect(limiter.tryStart("another-free", "openrouter", 10)).toBeNull()
  })

  it("says how long until a limited model returns", () => {
    const { limiter, clock } = limiterAt()
    limiter.noteRateLimited("a", "retry in 10s")
    expect(limiter.msUntilAvailable([{ model: "a", provider: "groq" }])).toBe(11_000)
    clock.t += 12_000
    expect(limiter.msUntilAvailable([{ model: "a", provider: "groq" }])).toBe(0)
    expect(limiter.tryStart("a", "groq", 10)).not.toBeNull()
  })
})

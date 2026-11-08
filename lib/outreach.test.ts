import { describe, expect, it } from "vitest"
import { capWords, countWords, fallbackMessage, formatPhone, parseMessages, whatsappLink, type OutreachProfile } from "./outreach"

describe("formatPhone", () => {
  it("joins a stored country code with a 10-digit number", () => {
    const p = formatPhone("7207419618", "+91")!
    expect(p.display).toBe("+91 72074 19618")
    expect(p.waDigits).toBe("917207419618")
    expect(p.assumedCountryCode).toBe(false)
  })

  it("assumes +91 for a bare Indian mobile and says so", () => {
    const p = formatPhone("8688284948", null)!
    expect(p.waDigits).toBe("918688284948")
    expect(p.assumedCountryCode).toBe(true)
  })

  it("does not duplicate a code already inside the number", () => {
    expect(formatPhone("+91 98180 55526", "+91")!.waDigits).toBe("919818055526")
    expect(formatPhone("919818055526", "91")!.waDigits).toBe("919818055526")
  })

  it("keeps a US number with its own +1", () => {
    const p = formatPhone("+1 (415) 555-0134", null)!
    expect(p.countryCode).toBe("+1")
    expect(p.national).toBe("4155550134")
  })

  it("rejects empty or junk numbers", () => {
    expect(formatPhone("", "+91")).toBeNull()
    expect(formatPhone("123", "+91")).toBeNull()
  })

  it("builds a wa.me link only when the country code is known", () => {
    expect(whatsappLink(formatPhone("7207419618", "+91"), "Hi there")).toBe("https://wa.me/917207419618?text=Hi%20there")
    expect(whatsappLink(formatPhone("12345678", null))).toBeNull()
  })
})

describe("messages", () => {
  const profile: OutreachProfile = { userId: "u1", firstName: "Riya", jobsApplied: 6, jobsSwiped: 40, companies: ["Wing", "Stripe"] }

  it("template introduces the founder, cites the count, asks feedback and intent, under 100 words", () => {
    const m = fallbackMessage(profile)
    expect(m).toContain("I'm Aditya, the founder of Iris")
    expect(m).toContain("applied to 6 jobs")
    expect(m).toMatch(/feedback/i)
    expect(m).toMatch(/laid off/)
    expect(m).not.toMatch(/premium|price|₹|\$/i)
    expect(countWords(m)).toBeLessThanOrEqual(100)
  })

  it("falls back to swipes, then signup, when nothing was applied", () => {
    expect(fallbackMessage({ ...profile, jobsApplied: 0, companies: [] })).toContain("swiped through 40 jobs")
    expect(fallbackMessage({ ...profile, jobsApplied: 0, jobsSwiped: 0, companies: [] })).toContain("signed up")
  })

  it("caps long text at 100 words", () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is here.`).join(" ")
    expect(countWords(capWords(long))).toBeLessThanOrEqual(100)
  })

  it("parses a JSON array wrapped in prose or code fences", () => {
    const got = parseMessages('Sure:\n```json\n[{"id":"u1","message":"Hi Riya"},{"id":"u2","message":""}]\n```')
    expect(got.get("u1")).toBe("Hi Riya")
    expect(got.has("u2")).toBe(false)
    expect(parseMessages("not json").size).toBe(0)
  })
})

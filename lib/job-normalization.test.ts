import { describe, expect, it } from "vitest"
import { hasSeniorityMarker, jobContentKey, normalizeCompanyName, normalizeJobTitle } from "./job-identity"

describe("normalizeJobTitle", () => {
  it("strips EU gender suffixes in their many forms", () => {
    expect(normalizeJobTitle("Senior Python Developer (m/f/d)")).toBe("senior python developer")
    expect(normalizeJobTitle("Backend Engineer (w/m/d)")).toBe("backend engineer")
    expect(normalizeJobTitle("Data Analyst (all genders)")).toBe("data analyst")
  })

  it("strips work type and arrangement", () => {
    expect(normalizeJobTitle("Full-time Backend Engineer")).toBe("backend engineer")
    expect(normalizeJobTitle("Backend Engineer (Remote)")).toBe("backend engineer")
    expect(normalizeJobTitle("Backend Engineer - Hybrid")).toBe("backend engineer")
  })

  it("handles the full documented example", () => {
    expect(normalizeJobTitle("Senior Python Developer (m/f/d) - Remote")).toBe("senior python developer")
  })

  it("KEEPS seniority — senior and junior are different jobs", () => {
    expect(normalizeJobTitle("Senior Engineer")).toContain("senior")
    expect(normalizeJobTitle("Junior Engineer")).toContain("junior")
    expect(normalizeJobTitle("Senior Engineer")).not.toBe(normalizeJobTitle("Junior Engineer"))
    expect(normalizeJobTitle("Staff Engineer")).toContain("staff")
  })

  it("preserves tech tokens with punctuation", () => {
    expect(normalizeJobTitle("C++ Developer")).toContain("c++")
    expect(normalizeJobTitle("C# Engineer")).toContain("c#")
  })

  it("handles empty input", () => {
    expect(normalizeJobTitle("")).toBe("")
    expect(normalizeJobTitle(null)).toBe("")
  })
})

describe("normalizeCompanyName", () => {
  it("strips legal suffixes", () => {
    expect(normalizeCompanyName("Apple Inc.")).toBe("apple")
    expect(normalizeCompanyName("Acme LLC")).toBe("acme")
    expect(normalizeCompanyName("Contoso Ltd")).toBe("contoso")
    expect(normalizeCompanyName("Beispiel GmbH")).toBe("beispiel")
  })

  it("strips regional qualifiers on subsidiaries", () => {
    expect(normalizeCompanyName("Google Germany GmbH")).toBe("google")
    expect(normalizeCompanyName("Amazon India")).toBe("amazon")
  })

  it("never normalizes down to nothing", () => {
    // "Limited Inc" is all suffix — falling through to "" would make every
    // such company collide with every other.
    expect(normalizeCompanyName("Limited Inc")).not.toBe("")
    expect(normalizeCompanyName("Group Holding")).not.toBe("")
  })

  it("handles empty input", () => {
    expect(normalizeCompanyName("")).toBe("")
    expect(normalizeCompanyName(null)).toBe("")
  })
})

describe("jobContentKey", () => {
  it("collapses cosmetic variants of the same posting", () => {
    const a = jobContentKey("Senior Python Developer (m/f/d) - Remote", "Google Germany GmbH")
    const b = jobContentKey("Senior Python Developer", "Google")
    expect(a).toBe(b)
    expect(a).toBe("google::senior python developer")
  })

  it("keeps genuinely different roles apart", () => {
    expect(jobContentKey("Senior Engineer", "Acme")).not.toBe(jobContentKey("Junior Engineer", "Acme"))
    expect(jobContentKey("Engineer", "Acme")).not.toBe(jobContentKey("Engineer", "Globex"))
  })

  it("returns empty when either side normalizes away", () => {
    // An empty key would match everything — callers must be able to detect it.
    expect(jobContentKey("", "Acme")).toBe("")
    expect(jobContentKey("Engineer", "")).toBe("")
  })
})

describe("hasSeniorityMarker", () => {
  it("detects seniority that survived normalization", () => {
    expect(hasSeniorityMarker("Senior Backend Engineer (m/f/d)")).toBe(true)
    expect(hasSeniorityMarker("Principal Architect")).toBe(true)
    expect(hasSeniorityMarker("Backend Engineer")).toBe(false)
  })
})

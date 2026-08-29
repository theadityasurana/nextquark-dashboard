import { describe, expect, it } from "vitest"
import { estimateCoverage, type CoverageProfile } from "./fill-coverage"

const full: CoverageProfile = {
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  phone: "5551234567",
  location: "London",
  resume_url: "resumes/ada.pdf",
  linkedin_url: "https://linkedin.com/in/ada",
  github_url: "https://github.com/ada",
  work_authorization_status: "US Citizen",
  experience: [{}],
  education: [{}],
  skills: ["Go"],
  gender: "Female",
  ethnicity: "Prefer not to say",
  veteran_status: "No",
  disability_status: "No",
  cover_letter: "Dear team,",
}

describe("estimateCoverage", () => {
  it("scores a complete profile at 100%", () => {
    const r = estimateCoverage(full, "Greenhouse")
    expect(r.percent).toBe(100)
    expect(r.missing).toHaveLength(0)
    expect(r.canReachSubmit).toBe(true)
  })

  it("flags a missing résumé as blocking", () => {
    const r = estimateCoverage({ ...full, resume_url: null }, "Greenhouse")
    expect(r.canReachSubmit).toBe(false)
    expect(r.blockingMissing).toContain("Résumé")
  })

  it("treats whitespace-only strings as missing", () => {
    const r = estimateCoverage({ ...full, phone: "   " }, "Lever")
    expect(r.blockingMissing).toContain("Phone")
  })

  it("treats empty arrays as missing", () => {
    const r = estimateCoverage({ ...full, skills: [] }, "Lever")
    expect(r.missing).toContain("Skills")
  })

  it("can reach submit at partial coverage when nothing blocking is missing", () => {
    // The distinction the whole report exists to make: percent is context,
    // canReachSubmit is the decision.
    const r = estimateCoverage(
      { ...full, github_url: null, cover_letter: null, gender: null, ethnicity: null },
      "Greenhouse"
    )
    expect(r.percent).toBeLessThan(100)
    expect(r.canReachSubmit).toBe(true)
  })

  it("cannot reach submit even at high coverage when a blocking field is gone", () => {
    const r = estimateCoverage({ ...full, email: null }, "Greenhouse")
    expect(r.percent).toBeGreaterThan(80)
    expect(r.canReachSubmit).toBe(false)
  })

  it("scores portals against different field sets", () => {
    // Lever asks for GitHub and a cover letter; Greenhouse asks for EEO fields.
    const lever = estimateCoverage(full, "Lever")
    const greenhouse = estimateCoverage(full, "Greenhouse")
    expect(lever.totalFields).not.toBe(greenhouse.totalFields)
  })

  it("counts a field once even when a portal repeats a core field", () => {
    const r = estimateCoverage(full, "Greenhouse")
    const unique = new Set([...r.filled, ...r.missing])
    expect(unique.size).toBe(r.totalFields)
  })

  it("falls back to the core set for an unknown or missing portal", () => {
    expect(estimateCoverage(full, "NotARealPortal").totalFields).toBe(11)
    expect(estimateCoverage(full, null).totalFields).toBe(11)
  })

  it("reports every blocking field on an empty profile", () => {
    const r = estimateCoverage({}, "Greenhouse")
    expect(r.percent).toBe(0)
    expect(r.blockingMissing).toEqual(
      expect.arrayContaining(["First name", "Last name", "Email", "Phone", "Résumé"])
    )
  })
})

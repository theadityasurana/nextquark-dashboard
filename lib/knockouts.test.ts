import { describe, expect, it } from "vitest"
import {
  classifyCandidateAuth,
  classifyJobAuth,
  evaluateKnockouts,
  totalYearsOfExperience,
  type KnockoutCandidate,
  type KnockoutJob,
} from "./knockouts"

const NOW = new Date("2026-08-23T00:00:00.000Z")

const candidate = (over: Partial<KnockoutCandidate> = {}): KnockoutCandidate => ({
  work_authorization_status: "US Citizen",
  location: "San Francisco, CA",
  preferred_cities: [],
  work_mode_preferences: [],
  experience: [{ startDate: "2020-01-01", endDate: null, isCurrent: true }],
  ...over,
})

const job = (over: Partial<KnockoutJob> = {}): KnockoutJob => ({
  work_authorization: "",
  experience: "Not specified",
  location: "Remote",
  description: "",
  ...over,
})

describe("classifyJobAuth", () => {
  it("reads the structured column first", () => {
    expect(classifyJobAuth(job({ work_authorization: "Will sponsor work visa (H1B, etc.)" }))).toBe("will_sponsor")
    expect(classifyJobAuth(job({ work_authorization: "Must be authorized to work (no sponsorship)" }))).toBe("no_sponsorship")
    expect(classifyJobAuth(job({ work_authorization: "US Citizen or Green Card holder only" }))).toBe("citizen_only")
    expect(classifyJobAuth(job({ work_authorization: "Open to all work authorization statuses" }))).toBe("open")
  })

  it("falls back to scanning the description", () => {
    expect(classifyJobAuth(job({ description: "We are unable to sponsor visas at this time." }))).toBe("no_sponsorship")
    expect(classifyJobAuth(job({ description: "Visa sponsorship is available for this role." }))).toBe("will_sponsor")
  })

  it("does not trip on a posting that offers sponsorship", () => {
    // The false-positive this whole pattern set exists to prevent.
    expect(classifyJobAuth(job({ description: "We offer visa sponsorship and relocation." }))).not.toBe("no_sponsorship")
  })

  it("returns unknown when nothing is stated", () => {
    expect(classifyJobAuth(job({ description: "Great team, great benefits." }))).toBe("unknown")
    expect(classifyJobAuth(job())).toBe("unknown")
  })
})

describe("classifyCandidateAuth", () => {
  it("classifies citizens and permanent residents", () => {
    expect(classifyCandidateAuth("US Citizen")).toBe("citizen")
    expect(classifyCandidateAuth("Green Card holder")).toBe("citizen")
  })

  it("classifies sponsorship needs, including future needs", () => {
    expect(classifyCandidateAuth("F-1 OPT")).toBe("needs_sponsorship")
    expect(classifyCandidateAuth("Requires H1B sponsorship")).toBe("needs_sponsorship")
    // Says "authorized" but also says it needs sponsorship — the need must win.
    expect(classifyCandidateAuth("Authorized to work, but will need sponsorship later")).toBe("needs_sponsorship")
  })

  it("classifies plain authorization", () => {
    expect(classifyCandidateAuth("Authorized to work in the US")).toBe("authorized")
    expect(classifyCandidateAuth("EAD")).toBe("authorized")
  })

  it("returns unknown for blank or unrecognized input", () => {
    expect(classifyCandidateAuth("")).toBe("unknown")
    expect(classifyCandidateAuth(null)).toBe("unknown")
    expect(classifyCandidateAuth("something else entirely")).toBe("unknown")
  })
})

describe("work authorization knockout", () => {
  it("hard-fails when the candidate needs sponsorship and the posting refuses", () => {
    const r = evaluateKnockouts(
      candidate({ work_authorization_status: "F-1 OPT" }),
      job({ work_authorization: "Must be authorized to work (no sponsorship)" })
    )
    expect(r.blocked).toBe(true)
    expect(r.failures[0].key).toBe("work_authorization")
  })

  it("hard-fails on a citizen-only posting for a candidate needing sponsorship", () => {
    const r = evaluateKnockouts(
      candidate({ work_authorization_status: "F-1 OPT" }),
      job({ work_authorization: "US Citizen or Green Card holder only" })
    )
    expect(r.blocked).toBe(true)
  })

  it("passes when the posting sponsors", () => {
    const r = evaluateKnockouts(
      candidate({ work_authorization_status: "F-1 OPT" }),
      job({ work_authorization: "Will sponsor work visa (H1B, etc.)" })
    )
    expect(r.blocked).toBe(false)
  })

  it("only warns when sponsorship is unstated — never blocks on silence", () => {
    const r = evaluateKnockouts(candidate({ work_authorization_status: "F-1 OPT" }), job())
    expect(r.blocked).toBe(false)
    expect(r.warnings.some((w) => w.key === "work_authorization")).toBe(true)
  })

  it("never gates a citizen", () => {
    const r = evaluateKnockouts(
      candidate({ work_authorization_status: "US Citizen" }),
      job({ work_authorization: "US Citizen or Green Card holder only" })
    )
    expect(r.checks.some((c) => c.key === "work_authorization")).toBe(false)
  })

  it("warns rather than fails for an authorized candidate on a citizen-only posting", () => {
    const r = evaluateKnockouts(
      candidate({ work_authorization_status: "Authorized to work in the US" }),
      job({ work_authorization: "US Citizen or Green Card holder only" })
    )
    expect(r.blocked).toBe(false)
    expect(r.warnings.some((w) => w.key === "work_authorization")).toBe(true)
  })
})

describe("totalYearsOfExperience", () => {
  it("sums closed and current roles", () => {
    const years = totalYearsOfExperience(
      [
        { startDate: "2018-01-01", endDate: "2020-01-01" },
        { startDate: "2022-08-01", endDate: null, isCurrent: true },
      ],
      NOW
    )
    // 2 years + 4 years to Aug 2026.
    expect(years).toBeCloseTo(6, 0)
  })

  it("returns null with no usable history", () => {
    expect(totalYearsOfExperience([], NOW)).toBeNull()
    expect(totalYearsOfExperience(null, NOW)).toBeNull()
    expect(totalYearsOfExperience([{ startDate: "not-a-date" }], NOW)).toBeNull()
  })

  it("ignores roles that end before they start", () => {
    expect(totalYearsOfExperience([{ startDate: "2024-01-01", endDate: "2020-01-01" }], NOW)).toBeNull()
  })
})

describe("experience knockout", () => {
  it("warns but never fails on a large seniority gap", () => {
    const r = evaluateKnockouts(
      candidate({ experience: [{ startDate: "2025-06-01", endDate: null, isCurrent: true }] }),
      job({ experience: "Director" })
    )
    expect(r.blocked).toBe(false)
    expect(r.warnings.some((w) => w.key === "experience")).toBe(true)
  })

  it("warns when the candidate is far over-levelled", () => {
    const r = evaluateKnockouts(
      candidate({ experience: [{ startDate: "2010-01-01", endDate: null, isCurrent: true }] }),
      job({ experience: "Internship" })
    )
    expect(r.warnings.some((w) => w.key === "experience")).toBe(true)
  })

  it("stays silent when the posting does not state a level", () => {
    const r = evaluateKnockouts(candidate(), job({ experience: "Not specified" }))
    expect(r.checks.some((c) => c.key === "experience")).toBe(false)
  })
})

describe("location knockout", () => {
  it("passes remote roles", () => {
    const r = evaluateKnockouts(candidate({ location: "Austin, TX" }), job({ location: "Remote" }))
    expect(r.checks.find((c) => c.key === "location")?.status).toBe("pass")
  })

  it("passes when the candidate lives in the job's city", () => {
    const r = evaluateKnockouts(candidate({ location: "San Francisco, CA" }), job({ location: "San Francisco, CA" }))
    expect(r.checks.find((c) => c.key === "location")?.status).toBe("pass")
  })

  it("passes when the city is in the candidate's preferred list", () => {
    const r = evaluateKnockouts(
      candidate({ location: "Austin, TX", preferred_cities: ["New York, NY"] }),
      job({ location: "New York, NY" })
    )
    expect(r.checks.find((c) => c.key === "location")?.status).toBe("pass")
  })

  it("warns — never fails — on a city mismatch", () => {
    const r = evaluateKnockouts(candidate({ location: "Austin, TX" }), job({ location: "Boston, MA" }))
    expect(r.blocked).toBe(false)
    expect(r.warnings.some((w) => w.key === "location")).toBe(true)
  })

  it("stays silent for a remote-seeking candidate on a non-onsite posting", () => {
    const r = evaluateKnockouts(
      candidate({ location: "Austin, TX", work_mode_preferences: ["Remote"] }),
      job({ location: "Boston, MA" })
    )
    expect(r.checks.some((c) => c.key === "location")).toBe(false)
  })

  it("still warns a remote-seeking candidate when the posting says onsite", () => {
    const r = evaluateKnockouts(
      candidate({ location: "Austin, TX", work_mode_preferences: ["Remote"] }),
      job({ location: "Boston, MA (On-site)" })
    )
    expect(r.warnings.some((w) => w.key === "location")).toBe(true)
  })
})

describe("evaluateKnockouts", () => {
  it("is clean for a well-matched pair", () => {
    const r = evaluateKnockouts(candidate(), job())
    expect(r.blocked).toBe(false)
    expect(r.failures).toHaveLength(0)
    expect(r.blockReason).toBeNull()
  })

  it("summarizes every failure into one block reason", () => {
    const r = evaluateKnockouts(
      candidate({ work_authorization_status: "F-1 OPT" }),
      job({ work_authorization: "Must be authorized to work (no sponsorship)" })
    )
    expect(r.blockReason).toContain("does not sponsor")
  })

  it("warnings alone never block dispatch", () => {
    const r = evaluateKnockouts(
      candidate({ location: "Austin, TX", experience: [{ startDate: "2025-06-01", isCurrent: true }] }),
      job({ location: "Boston, MA", experience: "Director" })
    )
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(r.blocked).toBe(false)
  })
})

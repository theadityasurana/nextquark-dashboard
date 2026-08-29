import { describe, expect, it } from "vitest"
import {
  atsPostingKey,
  jobDedupeKey,
  normalizeJobUrl,
  registrableDomain,
  stableJobId,
} from "./job-identity"

describe("registrableDomain", () => {
  it("takes the last two labels and drops www", () => {
    expect(registrableDomain("boards.greenhouse.io")).toBe("greenhouse.io")
    expect(registrableDomain("www.acme.com")).toBe("acme.com")
    expect(registrableDomain("acme.com")).toBe("acme.com")
  })
})

describe("atsPostingKey", () => {
  it("folds every Greenhouse URL variant to one key", () => {
    // The regression this module exists for: four URLs, one posting.
    const variants = [
      "https://boards.greenhouse.io/acme/jobs/4012345",
      "https://boards.greenhouse.io/acme/jobs/4012345?gh_src=a1b2c3",
      "https://boards.greenhouse.io/acme/jobs/4012345/",
      "https://job-boards.greenhouse.io/acme/jobs/4012345",
    ]
    for (const v of variants) expect(atsPostingKey(v)).toBe("greenhouse:4012345")
  })

  it("resolves an embedded Greenhouse form on the employer's own domain", () => {
    expect(atsPostingKey("https://acme.com/careers?gh_jid=4012345")).toBe("greenhouse:4012345")
  })

  it("ignores a non-numeric gh_jid", () => {
    expect(atsPostingKey("https://acme.com/careers?gh_jid=notanid")).toBeNull()
  })

  it("resolves Lever with and without /apply, case-insensitively", () => {
    expect(atsPostingKey("https://jobs.lever.co/acme/8f2c1d3e4a5b6c7d")).toBe("lever:8f2c1d3e4a5b6c7d")
    expect(atsPostingKey("https://jobs.lever.co/acme/8f2c1d3e4a5b6c7d/apply")).toBe("lever:8f2c1d3e4a5b6c7d")
    expect(atsPostingKey("https://jobs.lever.co/acme/8F2C1D3E4A5B6C7D")).toBe("lever:8f2c1d3e4a5b6c7d")
  })

  it("resolves Ashby", () => {
    expect(atsPostingKey("https://jobs.ashbyhq.com/acme/8f2c1d3e-4a5b-6c7d-8e9f")).toBe(
      "ashby:8f2c1d3e-4a5b-6c7d-8e9f"
    )
  })

  it("resolves SmartRecruiters", () => {
    expect(atsPostingKey("https://jobs.smartrecruiters.com/Acme/743999912345-engineer")).toBe(
      "smartrecruiters:743999912345"
    )
  })

  it("resolves Workday, scoped by tenant so req ids can't collide across tenants", () => {
    expect(
      atsPostingKey("https://acme.wd1.myworkdayjobs.com/careers/job/SF/Engineer_R-1043928")
    ).toBe("workday:acme:R-1043928")
    // Same req number, different tenant — must not be the same key.
    expect(
      atsPostingKey("https://globex.wd5.myworkdayjobs.com/ext/job/NY/Engineer_R-1043928")
    ).not.toBe("workday:acme:R-1043928")
  })

  it("returns null for a board listing page or an unknown host", () => {
    expect(atsPostingKey("https://boards.greenhouse.io/acme")).toBeNull()
    expect(atsPostingKey("https://acme.com/careers/engineer")).toBeNull()
  })

  it("returns null for a malformed URL rather than throwing", () => {
    expect(atsPostingKey("not a url")).toBeNull()
  })
})

describe("normalizeJobUrl", () => {
  it("drops protocol, www, trailing slash and fragment", () => {
    expect(normalizeJobUrl("https://www.acme.com/careers/engineer/#apply")).toBe(
      "acme.com/careers/engineer"
    )
    expect(normalizeJobUrl("http://acme.com/careers/engineer")).toBe("acme.com/careers/engineer")
  })

  it("drops tracking params but keeps identifying ones", () => {
    expect(normalizeJobUrl("https://acme.com/jobs?utm_source=x&id=42&gh_src=y")).toBe(
      "acme.com/jobs?id=42"
    )
  })

  it("sorts params so ordering doesn't create a second key", () => {
    expect(normalizeJobUrl("https://acme.com/j?b=2&a=1")).toBe(normalizeJobUrl("https://acme.com/j?a=1&b=2"))
  })

  it("folds an unparseable string rather than throwing", () => {
    expect(normalizeJobUrl("  Not A URL  ")).toBe("not a url")
  })
})

describe("jobDedupeKey", () => {
  it("prefers the ATS posting key", () => {
    expect(jobDedupeKey("https://boards.greenhouse.io/acme/jobs/4012345?gh_src=x")).toBe(
      "greenhouse:4012345"
    )
  })

  it("falls back to the normalized URL off-ATS", () => {
    expect(jobDedupeKey("https://www.acme.com/careers/engineer/?utm_source=x")).toBe(
      "acme.com/careers/engineer"
    )
  })
})

describe("stableJobId", () => {
  it("is stable across URL variants of the same posting", () => {
    const a = stableJobId("A", "https://boards.greenhouse.io/acme/jobs/4012345", "Engineer")
    const b = stableJobId("A", "https://boards.greenhouse.io/acme/jobs/4012345?gh_src=x", "Engineer")
    expect(a).toBe(b)
  })

  it("is stable across calls — never random", () => {
    const url = "https://jobs.lever.co/acme/8f2c1d3e4a5b6c7d"
    expect(stableJobId("A", url, "Engineer")).toBe(stableJobId("A", url, "Engineer"))
  })

  it("differs for genuinely different postings", () => {
    expect(stableJobId("A", "https://boards.greenhouse.io/acme/jobs/1", "X")).not.toBe(
      stableJobId("A", "https://boards.greenhouse.io/acme/jobs/2", "X")
    )
  })

  it("stays readable and slugged from the title", () => {
    const id = stableJobId("A", "https://boards.greenhouse.io/acme/jobs/4012345", "Senior Backend Engineer")
    expect(id).toMatch(/^A-senior-backend-engineer-[a-z0-9]+$/)
  })

  it("works without a title", () => {
    expect(stableJobId("A", "https://boards.greenhouse.io/acme/jobs/4012345")).toMatch(/^A-[a-z0-9]+$/)
  })

  it("sanitizes an unusable prefix", () => {
    expect(stableJobId("", "https://boards.greenhouse.io/acme/jobs/1", "X")).toMatch(/^job-/)
    expect(stableJobId("!!", "https://boards.greenhouse.io/acme/jobs/1", "X")).toMatch(/^job-/)
  })

  it("does not collide two postings whose titles truncate to the same slug", () => {
    const long = "Senior Staff Software Engineer Distributed Systems Platform Team"
    const a = stableJobId("A", "https://boards.greenhouse.io/acme/jobs/1", long)
    const b = stableJobId("A", "https://boards.greenhouse.io/acme/jobs/2", long)
    expect(a).not.toBe(b)
  })
})

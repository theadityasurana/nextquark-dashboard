import { describe, expect, it } from "vitest"
import { CONFIDENT_THRESHOLD, detectPortal, detectPortalScored } from "./portal-detector"

describe("detectPortal (unchanged contract)", () => {
  it("still resolves the portals it always did", () => {
    expect(detectPortal("https://jobs.lever.co/acme/8f2c1d3e4a5b6c7d")?.name).toBe("Lever")
    expect(detectPortal("https://boards.greenhouse.io/acme/jobs/4012345")?.name).toBe("Greenhouse")
    expect(detectPortal("https://jobs.ashbyhq.com/acme/8f2c1d3e4a5b6c7d")?.name).toBe("Ashby")
    expect(detectPortal("https://acme.myworkdayjobs.com/careers/job/123")?.name).toBe("Workday")
  })

  it("returns null for an unrecognized URL", () => {
    expect(detectPortal("https://acme.com/careers/engineer")).toBeNull()
  })

  it("still builds apply URLs the same way", () => {
    const lever = detectPortal("https://jobs.lever.co/acme/8f2c1d3e4a5b6c7d")
    expect(lever?.getApplyUrl("https://jobs.lever.co/acme/8f2c1d3e4a5b6c7d")).toMatch(/\/apply$/)
    // Already-suffixed URLs must not double up.
    expect(lever?.getApplyUrl("https://jobs.lever.co/acme/8f2c1d3e4a5b6c7d/apply")).toMatch(/\/apply$/)

    const gh = detectPortal("https://boards.greenhouse.io/acme/jobs/4012345#app")
    expect(gh?.getApplyUrl("https://boards.greenhouse.io/acme/jobs/4012345#app")).not.toContain("#")
  })

  it("routes Ashby to /application, not the description page", () => {
    // The description page has no form at all: landing there produced 0 file
    // inputs and an audit that read "all required fields filled".
    const ashby = detectPortal("https://jobs.ashbyhq.com/openai/bf036b23-cd23-46d0-a02f-4b1483f4698a")
    expect(ashby?.getApplyUrl("https://jobs.ashbyhq.com/openai/bf036b23-cd23-46d0-a02f-4b1483f4698a")).toBe(
      "https://jobs.ashbyhq.com/openai/bf036b23-cd23-46d0-a02f-4b1483f4698a/application"
    )
  })

  it("does not double-append /application", () => {
    const ashby = detectPortal("https://jobs.ashbyhq.com/openai/bf036b23-cd23-46d0-a02f-4b1483f4698a")
    const already = "https://jobs.ashbyhq.com/openai/bf036b23-cd23-46d0-a02f-4b1483f4698a/application"
    expect(ashby?.getApplyUrl(already)).toBe(already)
    // Trailing slash is the same page, not a second one.
    expect(ashby?.getApplyUrl(already + "/")).toBe(already)
  })

  it("preserves query and hash when routing Ashby", () => {
    const ashby = detectPortal("https://jobs.ashbyhq.com/openai/bf036b23-cd23-46d0-a02f-4b1483f4698a")
    expect(ashby?.getApplyUrl("https://jobs.ashbyhq.com/openai/bf036b23-cd23-46d0-a02f-4b1483f4698a?ref=x")).toBe(
      "https://jobs.ashbyhq.com/openai/bf036b23-cd23-46d0-a02f-4b1483f4698a/application?ref=x"
    )
  })
})

describe("detectPortalScored", () => {
  it("scores a canonical posting URL as confident", () => {
    const d = detectPortalScored("https://boards.greenhouse.io/acme/jobs/4012345")
    expect(d?.portal.name).toBe("Greenhouse")
    expect(d!.confidence).toBeGreaterThanOrEqual(CONFIDENT_THRESHOLD)
    expect(d!.signals).toContain("canonical posting URL")
  })

  it("scores an embedded form marker on an employer's own domain", () => {
    const d = detectPortalScored("https://acme.com/careers?gh_jid=4012345")
    expect(d?.portal.name).toBe("Greenhouse")
    expect(d!.signals).toContain("embedded form marker")
  })

  it("scores a bare name mention below the confident threshold", () => {
    // A blog-style URL that merely contains the portal name — exactly the case
    // that used to dispatch with full confidence and waste a session.
    const d = detectPortalScored("https://acme.com/blog/why-we-love-greenhouse.io")
    expect(d?.portal.name).toBe("Greenhouse")
    expect(d!.confidence).toBeLessThan(CONFIDENT_THRESHOLD)
  })

  it("gives a host match more weight than a path match", () => {
    const host = detectPortalScored("https://jobs.lever.co/acme/8f2c1d3e4a5b6c7d")!
    const path = detectPortalScored("https://acme.com/apply/lever.co/redirect")!
    expect(host.confidence).toBeGreaterThan(path.confidence)
    expect(host.signals).toContain("host match")
  })

  it("returns null when nothing matches at all", () => {
    expect(detectPortalScored("https://acme.com/careers/engineer")).toBeNull()
  })

  it("caps confidence at 100", () => {
    const d = detectPortalScored("https://boards.greenhouse.io/acme/jobs/4012345?gh_jid=4012345")
    expect(d!.confidence).toBeLessThanOrEqual(100)
  })

  it("picks the best-scoring portal when a URL touches two", () => {
    // Canonical Ashby host, with an incidental mention of another portal.
    const d = detectPortalScored("https://jobs.ashbyhq.com/acme/8f2c1d3e4a5b6c7d?ref=lever.co")
    expect(d?.portal.name).toBe("Ashby")
  })

  it("survives a malformed URL without throwing", () => {
    expect(() => detectPortalScored("not a url at all")).not.toThrow()
    expect(detectPortalScored("jobs.lever.co/acme/8f2c1d3e4a5b6c7d")?.portal.name).toBe("Lever")
  })
})

// ─── SmartRecruiters postings are stored as API endpoints ───
//
// Every SmartRecruiters row in the jobs table (1,566, no exceptions) holds the
// REST endpoint the ingest read it from, not a page a person could apply on. It
// still matches /smartrecruiters\.com/, so the portal was detected correctly and
// the browser was then pointed at a JSON document — a "form" with zero fields,
// which audits as nothing-required-missing and silently applies to nothing.
describe("SmartRecruiters apply URL", () => {
  it("rewrites the API endpoint to the application page", () => {
    const sr = detectPortal("https://api.smartrecruiters.com/v1/companies/ServiceNow/postings/744000135949979")
    expect(sr?.name).toBe("SmartRecruiters")
    expect(sr?.getApplyUrl("https://api.smartrecruiters.com/v1/companies/ServiceNow/postings/744000135949979"))
      .toBe("https://jobs.smartrecruiters.com/ServiceNow/744000135949979")
  })

  it("leaves a real application URL alone", () => {
    const url = "https://jobs.smartrecruiters.com/LLNL/3743990013734826"
    expect(detectPortal(url)?.getApplyUrl(url)).toBe(url)
  })
})

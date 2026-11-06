import { describe, it, expect } from "vitest"
import { classifyLiveness, classifyResume, decideRunAction, greenhouseBoardCandidates, greenhousePosting, resolveDirectApplyUrl } from "./run-outcome"

describe("decideRunAction", () => {
  it("completes on success", () => {
    expect(decideRunAction({ success: true }, 1, 3).kind).toBe("completed")
  })

  it("deletes closed postings and pages that are not applications", () => {
    expect(decideRunAction({ failure: { failureClass: "expired", permanent: true } }, 1, 3).kind).toBe("delete")
    expect(decideRunAction({ failure: { failureClass: "not_application", permanent: true } }, 1, 3).kind).toBe("delete")
  })

  it("files other permanent failures under blocked, not delete", () => {
    expect(decideRunAction({ failure: { failureClass: "login_required", permanent: true } }, 1, 3).kind).toBe("blocked")
    expect(decideRunAction({ failure: { failureClass: "anti_bot", permanent: true } }, 2, 3).kind).toBe("blocked")
  })

  it("gives a spam flag one retry, since the application was not accepted", () => {
    expect(decideRunAction({ failure: { failureClass: "anti_bot", permanent: true } }, 1, 3)).toEqual({ kind: "retry", backoffSeconds: 600, countsAsAttempt: true })
  })

  it("files captcha under the captcha tab", () => {
    expect(decideRunAction({ failure: { failureClass: "captcha" } }, 1, 3).kind).toBe("awaiting_captcha")
    expect(decideRunAction({ error: "CAPTCHA was not solved by a human within 3 minutes" }, 1, 3).kind).toBe("awaiting_captcha")
  })

  it("retries a missing verification email, since a new submit sends a new code", () => {
    const error = "Submission not confirmed: the verification code email never arrived | Clicked Submit but no confirmation signal"
    expect(decideRunAction({ error, failure: { failureClass: "captcha" } }, 1, 3).kind).toBe("retry")
  })

  it("files it under OTP once the tries run out, even with reCAPTCHA on the page", () => {
    const error = "Submission not confirmed: the verification code email never arrived"
    expect(decideRunAction({ error, failure: { failureClass: "captcha" } }, 3, 3).kind).toBe("awaiting_otp")
  })

  it("retries a bot check on a new IP, then files it under CAPTCHA", () => {
    const blocked = { error: "A bot check is in front of this page: https://geo.captcha-delivery.com/x", failure: { failureClass: "captcha" } }
    expect(decideRunAction(blocked, 1, 3).kind).toBe("retry")
    expect(decideRunAction(blocked, 3, 3).kind).toBe("awaiting_captcha")
  })

  it("does not spend a try on our own infrastructure failing", () => {
    const a = decideRunAction({ error: "Invalid or disabled API key" }, 3, 3)
    expect(a).toEqual({ kind: "retry", backoffSeconds: 300, countsAsAttempt: false })
  })

  it("never retries after Submit was clicked, which could apply twice", () => {
    expect(decideRunAction({ error: "Submission not confirmed: Clicked Submit but no confirmation signal" }, 1, 3).kind).toBe("failed")
  })

  it("does not spend a try when Kernel's API stalls", () => {
    expect(decideRunAction({ error: "Kernel API error undefined: Request timed out." }, 3, 3)).toEqual({ kind: "retry", backoffSeconds: 300, countsAsAttempt: false })
  })

  it("retries ordinary failures until the attempts run out", () => {
    expect(decideRunAction({ error: "stuck" }, 2, 3).kind).toBe("retry")
    expect(decideRunAction({ error: "stuck" }, 3, 3).kind).toBe("failed")
  })
})

describe("classifyLiveness", () => {
  it("treats 404 and 410 as dead", () => {
    expect(classifyLiveness({ status: 404, finalUrl: "https://x.co/j/1" })).toMatch(/404/)
    expect(classifyLiveness({ status: 410, finalUrl: "https://x.co/j/1" })).toMatch(/410/)
  })

  it("treats a Greenhouse error redirect as dead", () => {
    expect(classifyLiveness({ status: 200, finalUrl: "https://boards.greenhouse.io/acme?error=true" })).toBeTruthy()
  })

  it("reads closed-posting wording", () => {
    expect(classifyLiveness({ status: 200, finalUrl: "https://x.co", text: "This job is no longer available." })).toBeTruthy()
  })

  it("never treats a bot wall or server error as dead", () => {
    expect(classifyLiveness({ status: 403, finalUrl: "https://x.co" })).toBeNull()
    expect(classifyLiveness({ status: 429, finalUrl: "https://x.co" })).toBeNull()
    expect(classifyLiveness({ status: 503, finalUrl: "https://x.co" })).toBeNull()
  })

  it("leaves a live posting alone", () => {
    expect(classifyLiveness({ status: 200, finalUrl: "https://x.co/j/1", text: "Apply for this job. Senior Engineer." })).toBeNull()
  })
})

describe("classifyResume", () => {
  it("reports a missing résumé or a broken link", () => {
    expect(classifyResume("", null)).toMatch(/no résumé/)
    expect(classifyResume("https://x.co/cv.pdf", 400)).toMatch(/HTTP 400/)
    expect(classifyResume("https://x.co/cv.pdf", 404)).toMatch(/HTTP 404/)
  })

  it("keeps the application when the check proves nothing", () => {
    expect(classifyResume("https://x.co/cv.pdf", 200)).toBeNull()
    expect(classifyResume("https://x.co/cv.pdf", null)).toBeNull()
    expect(classifyResume("https://x.co/cv.pdf", 503)).toBeNull()
  })
})

describe("greenhouse link resolution", () => {
  it("derives board names from the host and the company", () => {
    expect(greenhouseBoardCandidates("https://stripe.com/jobs/search?gh_jid=1", "Stripe")).toEqual(["stripe"])
    expect(greenhouseBoardCandidates("https://www.pinterestcareers.com/jobs/?gh_jid=1", "Pinterest")).toEqual(["pinterest"])
    expect(greenhouseBoardCandidates("https://careers.datadoghq.com/x?gh_jid=1", "Datadog")).toEqual(["datadoghq", "datadog"])
  })

  it("leaves links alone that are not company-hosted gh_jid links", async () => {
    expect(await resolveDirectApplyUrl("https://jobs.ashbyhq.com/acme/1", "Acme")).toBeNull()
    expect(await resolveDirectApplyUrl("https://boards.greenhouse.io/spacex/jobs/1?gh_jid=1", "SpaceX")).toBeNull()
    expect(await resolveDirectApplyUrl("not a url", "Acme")).toBeNull()
  })
})

describe("greenhousePosting", () => {
  it("reads the board and job from Greenhouse links", () => {
    expect(greenhousePosting("https://boards.greenhouse.io/andurilindustries/jobs/5159972007?gh_jid=5159972007")).toEqual({ board: "andurilindustries", jobId: "5159972007" })
    expect(greenhousePosting("https://job-boards.greenhouse.io/postman/jobs/7823417003")).toEqual({ board: "postman", jobId: "7823417003" })
  })
  it("ignores EU boards and other sites", () => {
    expect(greenhousePosting("https://job-boards.eu.greenhouse.io/acme/jobs/1")).toBeNull()
    expect(greenhousePosting("https://stripe.com/jobs/search?gh_jid=1")).toBeNull()
  })
})

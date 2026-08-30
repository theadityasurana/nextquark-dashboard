import { describe, expect, it } from "vitest"
import { evaluatePage, evaluateUrl } from "./unsafe-page"

const GREENHOUSE = "https://boards.greenhouse.io/acme/jobs/4012345"

describe("evaluatePage", () => {
  it("allows an ordinary application form", () => {
    const v = evaluatePage(GREENHOUSE, "Apply for Senior Engineer. First name. Last name. Résumé. Submit application.")
    expect(v.blocked).toBe(false)
    expect(v.kind).toBeNull()
  })

  it("blocks contractor marketplaces by host", () => {
    const v = evaluatePage("https://www.toptal.com/talent/apply", "Join our network of elite engineers")
    expect(v.blocked).toBe(true)
    expect(v.kind).toBe("wrong_flow")
    expect(v.reason).toContain("toptal.com")
  })

  it("does not block a posting that merely mentions a marketplace", () => {
    // Host-matched, not text-matched: plenty of real job descriptions name
    // Upwork as prior experience, and blocking those loses real applications.
    const v = evaluatePage(GREENHOUSE, "You will replace our current Upwork contractors with an in-house team.")
    expect(v.blocked).toBe(false)
  })

  it("blocks biometric and government-ID flows", () => {
    expect(evaluatePage(GREENHOUSE, "Please take a selfie to verify your identity").kind).toBe("unsafe")
    expect(evaluatePage(GREENHOUSE, "Upload a photo of your government issued ID").kind).toBe("unsafe")
    expect(evaluatePage(GREENHOUSE, "Complete a liveness check to continue").kind).toBe("unsafe")
  })

  it("blocks payment and bank-detail requests", () => {
    expect(evaluatePage(GREENHOUSE, "Enter your credit card number to continue").kind).toBe("unsafe")
    expect(evaluatePage(GREENHOUSE, "Enter the routing number for direct deposit").kind).toBe("unsafe")
  })

  // Identity and tax numbers no longer stop the run. Blocking the whole posting
  // over one field threw away a Commvault form whose other 22 inputs were filled
  // correctly; the field is answered with a reserved placeholder instead (see
  // `national_id` in answer-policy). Money still blocks: a pre-offer application
  // asking for card or bank details is a scam signal, not a form to complete.
  it("no longer blocks identity-number requests", () => {
    expect(evaluatePage(GREENHOUSE, "Please provide your Social Security Number").blocked).toBe(false)
    expect(evaluatePage(GREENHOUSE, "Aadhaar number is required").blocked).toBe(false)
  })

  it("blocks device-permission and recording flows", () => {
    expect(evaluatePage(GREENHOUSE, "Allow access to your camera to begin").kind).toBe("unsafe")
    expect(evaluatePage(GREENHOUSE, "Record a video introduction").kind).toBe("unsafe")
    expect(evaluatePage(GREENHOUSE, "Install proctoring software before starting").kind).toBe("unsafe")
  })

  it("blocks SSO sign-in pages", () => {
    const v = evaluatePage("https://accounts.google.com/signin/oauth", "Sign in to continue")
    expect(v.blocked).toBe(true)
    expect(v.kind).toBe("sso")
  })

  it("reports the more serious verdict when a page is both a marketplace and unsafe", () => {
    const v = evaluatePage("https://www.upwork.com/apply", "Set your hourly rate and upload a photo of your government issued ID")
    expect(v.kind).toBe("unsafe")
  })

  it("blocks rate-setting and talent-network flows by text", () => {
    expect(evaluatePage(GREENHOUSE, "Set your hourly rate to get started").kind).toBe("wrong_flow")
    expect(evaluatePage(GREENHOUSE, "Join our talent network to hear about future roles").kind).toBe("wrong_flow")
    expect(evaluatePage(GREENHOUSE, "Take the coding assessment to apply").kind).toBe("wrong_flow")
  })

  it("handles empty input without throwing", () => {
    expect(evaluatePage("", "").blocked).toBe(false)
  })
})

describe("evaluateUrl", () => {
  it("refuses known-bad hosts before a page is ever loaded", () => {
    expect(evaluateUrl("https://mercor.com/jobs/1").blocked).toBe(true)
    expect(evaluateUrl("https://okta.com/login").kind).toBe("sso")
  })

  it("allows a normal ATS URL", () => {
    expect(evaluateUrl(GREENHOUSE).blocked).toBe(false)
  })

  it("matches subdomains of a blocked host", () => {
    expect(evaluateUrl("https://www.toptal.com/x").blocked).toBe(true)
    expect(evaluateUrl("https://careers.toptal.com/x").blocked).toBe(true)
  })

  it("does not match a lookalike host", () => {
    expect(evaluateUrl("https://nottoptal.com/careers").blocked).toBe(false)
  })
})

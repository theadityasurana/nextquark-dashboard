import { describe, expect, it } from "vitest"
import { evaluateApplicationPage, isAtsHost, isBannedBotWall, isBotWall, evaluatePage, evaluateUrl } from "./unsafe-page"

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

describe("evaluateApplicationPage", () => {
  it("rejects a careers search page, even though it has inputs", () => {
    const text = "Search for a role. Enter work email. United States. Choose your country."
    expect(evaluateApplicationPage("https://stripe.com/jobs/search?gh_jid=8137997", text).blocked).toBe(true)
  })
  it("rejects a listing page holding one stray file input", () => {
    expect(evaluateApplicationPage("https://www.anduril.com/open-roles", "search jobs input-type-file").blocked).toBe(true)
  })
  it("accepts a sign-in step in front of a form", () => {
    expect(evaluateApplicationPage("https://acme.com/apply", "Create an account to continue").blocked).toBe(false)
  })
  it("rejects a careers page with no form", () => {
    expect(evaluateApplicationPage("https://avathon.com/company/careers/", "Join our team. Open roles.").kind).toBe("not_application")
  })
  it("rejects an API endpoint on an ATS domain", () => {
    expect(evaluateApplicationPage("https://api.smartrecruiters.com/v1/companies/x/postings/1", '{"id":"1"}').blocked).toBe(true)
  })
  it("accepts a form on a company site", () => {
    expect(evaluateApplicationPage("https://acme.com/apply", "First Name Last Name Email Resume").blocked).toBe(false)
    expect(evaluateApplicationPage("https://acme.com/apply", "Email input-type-file").blocked).toBe(false)
  })
  it("trusts ATS hosts, whose forms can hide in shadow DOM", () => {
    expect(evaluateApplicationPage("https://jobs.smartrecruiters.com/acme/1", "").blocked).toBe(false)
    expect(evaluateApplicationPage("https://boards.greenhouse.io/acme/jobs/1", "").blocked).toBe(false)
  })
  it("does not delete when the page could not be read", () => {
    expect(evaluateApplicationPage("https://acme.com/x", null).blocked).toBe(false)
  })
})

describe("job descriptions must not read as a request", () => {
  it("allows a posting that merely discusses payments", () => {
    const jd = "You will build credit card processing, billing address validation, payment details storage and bank account linking."
    expect(evaluatePage(GREENHOUSE, jd).blocked).toBe(false)
  })
  it("still blocks an actual request", () => {
    expect(evaluatePage(GREENHOUSE, "Please enter your billing address").kind).toBe("unsafe")
    expect(evaluatePage(GREENHOUSE, "Provide your bank account").kind).toBe("unsafe")
  })
})

describe("isBotWall", () => {
  it("recognises a bot check by host", () => {
    expect(isBotWall("https://geo.captcha-delivery.com/captcha/?initialCid=abc", "")).toBe(true)
  })
  it("recognises a short challenge page by its text", () => {
    expect(isBotWall("https://acme.com/jobs/1", "Checking your browser before accessing acme.com")).toBe(true)
  })
  it("leaves a real page alone, even one that mentions the words", () => {
    expect(isBotWall("https://acme.com/jobs/1", "First Name Last Name Resume")).toBe(false)
    expect(isBotWall("https://acme.com/jobs/1", `Are you a robot enthusiast? ${"Job description. ".repeat(200)}`)).toBe(false)
  })
})

describe("isBannedBotWall", () => {
  it("reads DataDome's ban marker", () => {
    expect(isBannedBotWall("https://geo.captcha-delivery.com/captcha/?initialCid=a&t=bv&cid=b")).toBe(true)
    expect(isBannedBotWall("https://geo.captcha-delivery.com/captcha/?initialCid=a&t=fe&cid=b")).toBe(false)
    expect(isBannedBotWall("https://acme.com/?t=bv")).toBe(false)
  })
})

describe("isAtsHost", () => {
  it("knows ATS hosts, but not their API endpoints or company sites", () => {
    expect(isAtsHost("https://job-boards.greenhouse.io/acme/jobs/1")).toBe(true)
    expect(isAtsHost("https://api.smartrecruiters.com/v1/companies/x")).toBe(false)
    expect(isAtsHost("https://stripe.com/jobs/search")).toBe(false)
  })
})

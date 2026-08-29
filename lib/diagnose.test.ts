import { describe, expect, it } from "vitest"
import { diagnose } from "./diagnose"

describe("diagnose", () => {
  it("classifies a closed posting as permanent and NOT the portal's fault", () => {
    // The pairing is the whole point: a closed posting must never be retried,
    // and three of them in a row must not trip the portal breaker for everyone.
    const d = diagnose({ pageText: "This job is no longer accepting applications." })
    expect(d.failureClass).toBe("expired")
    expect(d.permanent).toBe(true)
    expect(d.portalFault).toBe(false)
  })

  it("classifies an anti-bot block as permanent AND the portal's fault", () => {
    const d = diagnose({ antiBotBlocked: true })
    expect(d.failureClass).toBe("anti_bot")
    expect(d.permanent).toBe(true)
    expect(d.portalFault).toBe(true)
    expect(d.suggestedAction).toMatch(/not retry/i)
  })

  it("classifies a page that was never an application", () => {
    const d = diagnose({ unsafePage: "toptal.com is a contractor marketplace" })
    expect(d.failureClass).toBe("not_application")
    expect(d.permanent).toBe(true)
    expect(d.portalFault).toBe(false)
  })

  it("treats an SSO wall as permanent, from the URL alone", () => {
    const d = diagnose({ finalUrl: "https://login.microsoftonline.com/common/oauth2/authorize" })
    expect(d.failureClass).toBe("login_required")
    expect(d.permanent).toBe(true)
  })

  it("treats an LLM quota failure as our infrastructure, retryable, not portal fault", () => {
    const d = diagnose({ llmError: true })
    expect(d.failureClass).toBe("infra")
    expect(d.permanent).toBe(false)
    expect(d.portalFault).toBe(false)
  })

  it("treats a dead browser session as infra rather than a portal problem", () => {
    const d = diagnose({ errors: ["Target closed: websocket disconnected"] })
    expect(d.failureClass).toBe("infra")
    expect(d.portalFault).toBe(false)
  })

  it("blames the portal for a timeout, a 5xx, and a stuck loop", () => {
    expect(diagnose({ timedOut: true }).portalFault).toBe(true)
    expect(diagnose({ pageText: "502 Bad Gateway" }).failureClass).toBe("portal_error")
    expect(diagnose({ loopDetected: true }).failureClass).toBe("stuck")
    expect(diagnose({ loopDetected: true }).portalFault).toBe(true)
  })

  it("distinguishes a rejected value from a field we could not fill", () => {
    const rejected = diagnose({ validationErrors: ["Phone number is invalid"] })
    expect(rejected.failureClass).toBe("validation")
    expect(rejected.rootCause).toContain("Phone number is invalid")

    const unfilled = diagnose({ unfilledRequired: ["Highest degree", "Start date"] })
    expect(unfilled.failureClass).toBe("form_incomplete")
    expect(unfilled.rootCause).toContain("Highest degree")
  })

  it("puts an unresolved CAPTCHA ahead of a mechanically incomplete form", () => {
    // A challenge blocks the form; the unfilled fields are its consequence, not
    // the cause. Reporting the consequence sends an operator to the wrong place.
    const d = diagnose({ captchaUnresolved: true, unfilledRequired: ["Email"] })
    expect(d.failureClass).toBe("captcha")
  })

  it("puts a closed posting ahead of every mechanical symptom it causes", () => {
    const d = diagnose({
      pageText: "This position has been filled.",
      unfilledRequired: ["Email", "Phone"],
      validationErrors: ["Required"],
      loopDetected: true,
    })
    expect(d.failureClass).toBe("expired")
  })

  it("falls back to unknown without inventing a cause", () => {
    const d = diagnose({})
    expect(d.failureClass).toBe("unknown")
    expect(d.permanent).toBe(false)
    expect(d.portalFault).toBe(false)
  })
})

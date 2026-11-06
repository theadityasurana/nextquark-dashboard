import { describe, it, expect } from "vitest"
import { isConfirmationEmail, pickCodeEmail } from "./submission-email"

describe("isConfirmationEmail", () => {
  it("accepts the confirmation emails seen from live runs", () => {
    expect(isConfirmationEmail({ subject: "Thank you for applying to OpenAI" }, "OpenAI")).toBe(true)
    expect(isConfirmationEmail({ subject: "Thank you for your application to UiPath: Revenue Operations Analyst" }, "UiPath")).toBe(true)
    expect(isConfirmationEmail({ subject: "Your Application to Anduril" }, "Anduril")).toBe(true)
    expect(isConfirmationEmail({ subject: "Thank you for applying to Snowflake | Strategic Finance Analyst II" }, "Snowflake")).toBe(true)
  })

  it("finds the company in the sender or body when the subject omits it", () => {
    expect(isConfirmationEmail({ subject: "We've received your application", from_email: "no-reply@stripe.com" }, "Stripe")).toBe(true)
    expect(isConfirmationEmail({ subject: "Your application", body_text: "Thanks for applying to Rubrik." }, "Rubrik")).toBe(true)
  })

  it("never treats a verification code as proof", () => {
    expect(isConfirmationEmail({ subject: "Security code for your application to Quince" }, "Quince")).toBe(false)
  })

  it("does not count a rejection, or another company's mail", () => {
    expect(isConfirmationEmail({ subject: "Your application: unfortunately we are not moving forward", from_email: "x@quince.com" }, "Quince")).toBe(false)
    expect(isConfirmationEmail({ subject: "Thank you for applying to Snowflake" }, "UiPath")).toBe(false)
  })

  it("does not match with no company to match", () => {
    expect(isConfirmationEmail({ subject: "Thank you for applying" }, "")).toBe(false)
  })
})

describe("pickCodeEmail", () => {
  const code = (subject: string, at: string) => ({ subject, received_at: at })
  const anduril = code("Security code for your application to Anduril Industries", "2026-11-06T06:31:00Z")
  const robinhood = code("Security code for your application to Robinhood", "2026-11-06T06:34:00Z")

  it("takes the code for this company, not the newest in the inbox", () => {
    expect(pickCodeEmail([robinhood, anduril], { company: "Anduril Industries" })).toBe(anduril)
  })
  it("returns nothing rather than another company's code", () => {
    expect(pickCodeEmail([robinhood], { company: "Anduril" })).toBeNull()
  })
  it("ignores a code from before this submit", () => {
    expect(pickCodeEmail([anduril], { company: "Anduril", sinceMs: Date.parse("2026-11-06T06:40:00Z") })).toBeNull()
  })
  it("ignores receipts that carry no code", () => {
    expect(pickCodeEmail([code("Thank you for applying to Anduril", "2026-11-06T06:40:00Z")], { company: "Anduril" })).toBeNull()
  })
  it("takes the newest when a company has several", () => {
    const newer = code("Security code for your application to Anduril", "2026-11-06T06:50:00Z")
    expect(pickCodeEmail([anduril, newer], { company: "Anduril" })).toBe(newer)
  })
})

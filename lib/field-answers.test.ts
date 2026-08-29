import { describe, expect, it } from "vitest"
import { dateCandidates, defaultStartDate, isConsentQuestion, isDateQuestion, valuesAgree } from "./field-answers"

describe("isDateQuestion", () => {
  it("recognizes start-date questions", () => {
    // The exact Ashby labels that went unanswered.
    expect(isDateQuestion("When can you start a new role?")).toBe(true)
    expect(isDateQuestion("Pick date")).toBe(true)
    expect(isDateQuestion("Earliest start date")).toBe(true)
    expect(isDateQuestion("Available from")).toBe(true)
    expect(isDateQuestion("Start date (MM/DD/YYYY)")).toBe(true)
  })

  it("does not treat ordinary questions as dates", () => {
    expect(isDateQuestion("Why do you want to work here?")).toBe(false)
    expect(isDateQuestion("Where are you located?")).toBe(false)
    // "update" contains "dat" but is not a date question.
    expect(isDateQuestion("Any updates to share?")).toBe(false)
  })
})

describe("isConsentQuestion", () => {
  it("recognizes certification and consent text", () => {
    expect(
      isConsentQuestion(
        "I hereby certify that I have not knowingly withheld any information that might adversely affect my chances for employment"
      )
    ).toBe(true)
    expect(isConsentQuestion("I agree to the terms and conditions")).toBe(true)
    expect(isConsentQuestion("I acknowledge the privacy policy")).toBe(true)
    expect(isConsentQuestion("I have read and understand the above")).toBe(true)
    expect(isConsentQuestion("I consent to data processing under GDPR")).toBe(true)
  })

  it("does not flag ordinary questions", () => {
    expect(isConsentQuestion("What are your salary expectations?")).toBe(false)
    expect(isConsentQuestion("Describe a hard technical problem")).toBe(false)
  })
})

describe("defaultStartDate", () => {
  it("defaults to two weeks out", () => {
    // Wed 2026-08-05 + 14d = Wed 2026-08-19, a weekday — no adjustment.
    const d = defaultStartDate({}, new Date("2026-08-05T12:00:00Z"))
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(19)
  })

  it("honours an explicit notice period", () => {
    const base = new Date("2026-08-05T12:00:00Z")
    const d = defaultStartDate({ noticePeriodDays: 30 }, base)
    expect(d.getTime()).toBeGreaterThan(defaultStartDate({}, base).getTime())
  })

  it("never lands on a weekend", () => {
    // Sweep a fortnight of start points; every result must be a working day.
    for (let i = 0; i < 14; i++) {
      const base = new Date(2026, 7, 1 + i, 12)
      const day = defaultStartDate({}, base).getDay()
      expect(day).not.toBe(0)
      expect(day).not.toBe(6)
    }
  })

  it("ignores a nonsensical notice period", () => {
    const base = new Date("2026-08-05T12:00:00Z")
    const fallback = defaultStartDate({}, base).getTime()
    expect(defaultStartDate({ noticePeriodDays: -5 }, base).getTime()).toBe(fallback)
    expect(defaultStartDate({ noticePeriodDays: "soon" }, base).getTime()).toBe(fallback)
    expect(defaultStartDate(null, base).getTime()).toBe(fallback)
  })
})

describe("dateCandidates", () => {
  it("emits US, ISO and EU formats, pipe-separated", () => {
    expect(dateCandidates(new Date(2026, 7, 19))).toBe("08/19/2026|2026-08-19|19/08/2026")
  })

  it("zero-pads single-digit months and days", () => {
    expect(dateCandidates(new Date(2026, 0, 5))).toBe("01/05/2026|2026-01-05|05/01/2026")
  })
})

describe("valuesAgree", () => {
  it("accepts an exact match", () => {
    expect(valuesAgree("Bengaluru", "Bengaluru")).toBe(true)
  })

  it("ignores case, punctuation and spacing", () => {
    // ATS résumé parsers normalize aggressively. Rewriting a field that is
    // already right costs an action and can undo a correct country-code pick.
    expect(valuesAgree("+91 98765 43210", "+919876543210")).toBe(true)
    expect(valuesAgree("PRIYA@EXAMPLE.COM", "priya@example.com")).toBe(true)
    expect(valuesAgree("Bachelor's Degree", "Bachelors Degree")).toBe(true)
  })

  it("accepts containment in either direction when the shorter side is substantial", () => {
    expect(valuesAgree("Bengaluru, KA, India", "Bengaluru")).toBe(true)
    expect(valuesAgree("Bengaluru", "Bengaluru, Karnataka")).toBe(true)
  })

  it("refuses containment on a very short value", () => {
    // Otherwise "No" agrees with "Norway" and every two-letter answer matches
    // almost anything on the page.
    expect(valuesAgree("No", "Norway")).toBe(false)
    expect(valuesAgree("Yes", "Yesterday")).toBe(false)
  })

  it("reports disagreement for a genuinely different value", () => {
    // The parser guessing the wrong job title is the case this exists to catch.
    expect(valuesAgree("Software Engineer", "Senior Backend Engineer")).toBe(false)
    expect(valuesAgree("Mumbai", "Bengaluru")).toBe(false)
  })

  it("treats an empty side as no agreement, so an empty field is filled", () => {
    expect(valuesAgree("", "Bengaluru")).toBe(false)
    expect(valuesAgree("Bengaluru", "")).toBe(false)
  })
})

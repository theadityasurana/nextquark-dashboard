import { describe, expect, it } from "vitest"
import { extractConfirmationId, looksLikeId } from "./confirmation-id"

describe("looksLikeId", () => {
  it("accepts real-looking references", () => {
    expect(looksLikeId("R-1043928")).toBe(true)
    expect(looksLikeId("ACM-MLJQF1JD-ZJ8Z")).toBe(true)
    expect(looksLikeId("APP12345")).toBe(true)
  })

  it("rejects prose and stopwords", () => {
    expect(looksLikeId("your")).toBe(false)
    expect(looksLikeId("shortly")).toBe(false)
    // No digit at all — the cheapest signal that it's a word, not an ID.
    expect(looksLikeId("CONFIRMED")).toBe(false)
  })

  it("rejects dates, times, phones and amounts", () => {
    expect(looksLikeId("2024-01-15")).toBe(false)
    expect(looksLikeId("01/15/2024")).toBe(false)
    expect(looksLikeId("14:32")).toBe(false)
    expect(looksLikeId("415-555-0199")).toBe(false)
    expect(looksLikeId("4155550199")).toBe(false)
    expect(looksLikeId("1250.00")).toBe(false)
    expect(looksLikeId("2024")).toBe(false)
  })

  it("rejects anything outside the length band", () => {
    expect(looksLikeId("A1")).toBe(false)
    expect(looksLikeId(`X1${"9".repeat(50)}`)).toBe(false)
  })
})

describe("extractConfirmationId", () => {
  it("returns null for empty or absent text", () => {
    expect(extractConfirmationId(null)).toBeNull()
    expect(extractConfirmationId(undefined)).toBeNull()
    expect(extractConfirmationId("")).toBeNull()
  })

  it("returns null when the page merely thanks the candidate", () => {
    expect(
      extractConfirmationId("Thank you for applying! We have received your application.")
    ).toBeNull()
  })

  it("pulls a labelled confirmation number across punctuation styles", () => {
    for (const text of [
      "Your confirmation number is R-1043928.",
      "Confirmation #: R-1043928",
      "Confirmation ID - R-1043928",
      "CONFIRMATION NUMBER R-1043928",
    ]) {
      expect(extractConfirmationId(text)?.id).toBe("R-1043928")
    }
  })

  it("recognizes the other labelled forms", () => {
    expect(extractConfirmationId("Reference number: REF-99201")).toEqual({
      id: "REF-99201",
      label: "reference number",
    })
    expect(extractConfirmationId("Application ID: APP12345")?.label).toBe("application ID")
    expect(extractConfirmationId("Candidate # C-88213")?.label).toBe("candidate ID")
    expect(extractConfirmationId("Requisition ID: JR-40021")?.label).toBe("requisition ID")
    expect(extractConfirmationId("Tracking code: TRK-5541")?.label).toBe("tracking number")
  })

  it("survives the whitespace real innerText carries", () => {
    const text = "Application submitted.\n\n   Confirmation number:\n\n   R-1043928\n"
    expect(extractConfirmationId(text)?.id).toBe("R-1043928")
  })

  it("strips trailing sentence punctuation from the capture", () => {
    expect(extractConfirmationId("Confirmation number: R-1043928.")?.id).toBe("R-1043928")
    expect(extractConfirmationId("(Confirmation number: R-1043928)")?.id).toBe("R-1043928")
  })

  it("prefers a labelled match over a bare pattern elsewhere on the page", () => {
    const text = "Role R-777777 · Your confirmation number is APP-40021"
    expect(extractConfirmationId(text)?.id).toBe("APP-40021")
  })

  it("falls back to bare portal-shaped ids when nothing is labelled", () => {
    expect(extractConfirmationId("Thanks! Your req is R-1043928 and we'll be in touch.")).toEqual(
      { id: "R-1043928", label: "requisition ID" }
    )
    expect(extractConfirmationId("Submitted — ACM-MLJQF1JD-ZJ8Z")?.id).toBe("ACM-MLJQF1JD-ZJ8Z")
  })

  it("does not mistake a date after the label for an ID", () => {
    // The regression that motivates looksLikeId: a confirmation page that prints
    // the submission date immediately after the word "confirmation".
    expect(extractConfirmationId("Confirmation date: 2024-01-15")).toBeNull()
  })

  it("does not mistake a support phone number for an ID", () => {
    expect(extractConfirmationId("Reference number: 415-555-0199")).toBeNull()
  })
})

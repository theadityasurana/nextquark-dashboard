import { describe, expect, it } from "vitest"
import { identifyField, resolveFieldValue, valueForSemantic, type CandidateData } from "./field-matcher"

const candidate: CandidateData = {
  firstName: "Ada",
  lastName: "Lovelace",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+919876543210",
  location: "Gurgaon, Haryana, India",
  linkedinUrl: "https://linkedin.com/in/ada",
  githubUrl: "https://github.com/ada",
}

describe("identifyField — attribute precedence", () => {
  it("prefers the autocomplete attribute above everything", () => {
    const m = identifyField({ autocomplete: "given-name", id: "last_name_field", label: "Email" })
    expect(m?.semantic).toBe("first_name")
    expect(m?.source).toBe("autocomplete")
  })

  it("handles multi-token autocomplete values", () => {
    expect(identifyField({ autocomplete: "shipping tel" })?.semantic).toBe("phone")
  })

  it("uses id/name before the visible label", () => {
    // The label says one thing, the id says another — the id is stable, so it wins.
    const m = identifyField({ id: "candidate_email", label: "Phone number" })
    expect(m?.semantic).toBe("email")
    expect(m?.source).toBe("attribute")
  })

  it("falls back to the label only when attributes are silent", () => {
    const m = identifyField({ label: "Where are you located?" })
    expect(m?.semantic).toBe("location")
    expect(m?.source).toBe("label")
  })

  it("returns null when nothing identifies the field", () => {
    expect(identifyField({ id: "field_9f2a", label: "Question 4" })).toBeNull()
  })
})

describe("identifyField — the specific ids that matter", () => {
  it("recognizes LinkedIn's geo-location id as a city field", () => {
    expect(identifyField({ id: "single-typeahead-entity-form-component-geo-location" })?.semantic).toBe("city")
  })

  it("distinguishes a national-number input from a full phone input", () => {
    // Writing the international number into a national-number box next to a
    // country dropdown produces a doubled dial code.
    expect(identifyField({ id: "phonenumber-nationalnumber" })?.semantic).toBe("phone_national")
    expect(identifyField({ name: "phone" })?.semantic).toBe("phone")
    expect(identifyField({ id: "phone-country-code" })?.semantic).toBe("phone_country")
  })

  it("keeps first/last name from collapsing into full name", () => {
    expect(identifyField({ name: "first_name" })?.semantic).toBe("first_name")
    expect(identifyField({ name: "last_name" })?.semantic).toBe("last_name")
    expect(identifyField({ name: "name" })?.semantic).toBe("full_name")
  })

  it("is immune to label mutation from an open dropdown", () => {
    // The exact regression: an open dropdown injected its options into the label.
    const stable = { id: "question_17622973004", name: "job_application[answers][0]" }
    const closed = identifyField({ ...stable, label: "How did you hear about this opportunity?" })
    const open = identifyField({
      ...stable,
      label: "How did you hear about this opportunity? Internet Online LinkedIn Job board",
    })
    // Neither resolves via the label, so both agree regardless of what it says.
    expect(open?.semantic).toBe(closed?.semantic)
  })

  it("identifies the referral-source question by label when the id is opaque", () => {
    expect(identifyField({ id: "question_1762", label: "How did you hear about us?" })?.semantic).toBe(
      "referral_source"
    )
  })
})

describe("valueForSemantic", () => {
  it("splits a full name when only the whole name is stored", () => {
    expect(valueForSemantic("first_name", { name: "Ada Lovelace" })).toBe("Ada")
    expect(valueForSemantic("last_name", { name: "Ada Lovelace" })).toBe("Lovelace")
  })

  it("composes a full name from parts", () => {
    expect(valueForSemantic("full_name", { firstName: "Ada", lastName: "Lovelace" })).toBe("Ada Lovelace")
  })

  it("strips the dial code for a national-number field", () => {
    expect(valueForSemantic("phone_national", { phone: "+919876543210" })).toBe("9876543210")
  })

  it("derives city and country from a comma-separated location", () => {
    expect(valueForSemantic("city", candidate)).toBe("Gurgaon")
    expect(valueForSemantic("country", candidate)).toBe("India")
  })

  it("returns empty rather than inventing a value", () => {
    expect(valueForSemantic("salary", {})).toBe("")
    expect(valueForSemantic("school", {})).toBe("")
  })

  it("returns empty for controls that take no typed value", () => {
    expect(valueForSemantic("consent", candidate)).toBe("")
    expect(valueForSemantic("resume", candidate)).toBe("")
  })

  it("defaults referral source to LinkedIn", () => {
    expect(valueForSemantic("referral_source", {})).toBe("LinkedIn")
  })
})

describe("resolveFieldValue", () => {
  it("identifies and resolves in one step", () => {
    const r = resolveFieldValue({ autocomplete: "email" }, candidate)
    expect(r).toMatchObject({ semantic: "email", value: "ada@example.com", source: "autocomplete" })
  })

  it("returns null for an unidentifiable field", () => {
    expect(resolveFieldValue({ id: "xyz" }, candidate)).toBeNull()
  })

  it("reports a recognized field with no data as an empty value, not null", () => {
    // "We know what this is but have no answer" must be distinguishable from
    // "we don't know what this is".
    const r = resolveFieldValue({ id: "salary_expectation" }, {})
    expect(r?.semantic).toBe("salary")
    expect(r?.value).toBe("")
  })
})

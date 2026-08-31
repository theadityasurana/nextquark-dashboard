import { describe, it, expect } from "vitest"
import { isAnswerButtonLabel, VM_DOM_HELPERS } from "./vm-dom"

// ─── The button-group scanner, pinned to real forms ───
//
// nqFindButtonGroups runs inside page.evaluate, so it cannot be imported here.
// Its one genuinely subtle decision — "is this button an answer, or is it the
// widget's own furniture?" — is exported instead, and interpolated into the VM
// source, so this file tests the same rule the browser runs.
//
// Every string below was taken from a live run's logs, not invented.

describe("isAnswerButtonLabel — Greenhouse combobox chrome", () => {
  // The exact pair Greenhouse renders for Location (City), Veteran Status and
  // Disability Status. Two clickable things, zero answers — which is how they
  // passed the `buttons.length >= 2` check and got claimed as button groups.
  // "Toggle flyout" was then handed to the model as the value to select.
  it("rejects the combobox chrome that made every Greenhouse select look like a button group", () => {
    expect(isAnswerButtonLabel("Clear selections")).toBe(false)
    expect(isAnswerButtonLabel("Toggle flyout")).toBe(false)
    expect(isAnswerButtonLabel("Locate me")).toBe(false)
  })

  it("still rejects plain actions", () => {
    for (const t of ["Upload File", "Add another", "Remove", "Cancel", "Submit Application", "Browse"]) {
      expect([t, isAnswerButtonLabel(t)]).toEqual([t, false])
    }
  })
})

describe("isAnswerButtonLabel — real answers must survive", () => {
  // Ashby's work-authorisation / sponsorship / office-attendance questions.
  // These are the three REQUIRED fields the whole button-group path exists for.
  it("accepts a Yes/No pair", () => {
    expect(isAnswerButtonLabel("Yes")).toBe(true)
    expect(isAnswerButtonLabel("No")).toBe(true)
  })

  // Straight from a SpaceX run's `offered:` list.
  it("accepts Greenhouse option text", () => {
    for (const t of [
      "Not applicable/Do not recall",
      "4.0 out of 4.0",
      "1600 out of 1600",
      "Careers site",
      "Glassdoor",
      "Did not take/Do not recall",
    ]) {
      expect([t, isAnswerButtonLabel(t)]).toEqual([t, true])
    }
  })

  // The chrome regexes are anchored and word-bounded so they cannot eat an
  // answer that merely starts with the same letters.
  it("does not reject an answer that happens to begin with a chrome word", () => {
    expect(isAnswerButtonLabel("Clearance held")).toBe(true)
    expect(isAnswerButtonLabel("Openness to relocation")).toBe(true)
    expect(isAnswerButtonLabel("Searching for a new role")).toBe(true)
  })

  it("rejects empty text and prose too long to be an option", () => {
    expect(isAnswerButtonLabel("")).toBe(false)
    expect(isAnswerButtonLabel("   ")).toBe(false)
    expect(isAnswerButtonLabel("x".repeat(41))).toBe(false)
  })
})

describe("VM_DOM_HELPERS", () => {
  // No test here for the stray-backtick build break that has bitten twice:
  // lib/vm-dom.ts is one big template literal, so an UNESCAPED backtick fails
  // to compile and tsc catches it before any test runs, while an ESCAPED one is
  // legitimate and does appear in the emitted string. There is nothing left to
  // assert at runtime.

  // The interpolation above must emit real regex literals, not "[object Object]".
  it("interpolates the button predicates as regex literals", () => {
    expect(VM_DOM_HELPERS).toContain("/^(clear|toggle|locate")
    expect(VM_DOM_HELPERS).toContain("/^(upload|add|remove")
    expect(VM_DOM_HELPERS).not.toContain("[object Object]")
  })
})

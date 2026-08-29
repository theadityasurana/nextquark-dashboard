import { describe, expect, it } from "vitest"
import {
  buildCheckboxPrompt,
  buildNumericPrompt,
  buildOptionPrompt,
  buildOptionRetryPrompt,
  buildTextualPrompt,
  buildTextualRetryPrompt,
  matchReplyToOption,
  MAX_OPTIONS_IN_PROMPT,
} from "./answer-prompts"

const ctx = { candidateName: "Ada Lovelace", jobTitle: "Engineer", companyName: "Acme" }
const OPTIONS = ["Internet", "Online", "LinkedIn", "Job board", "Referral"]

describe("buildOptionPrompt", () => {
  it("lists the real options and demands a verbatim reply", () => {
    const p = buildOptionPrompt("How did you hear about us?", OPTIONS, ctx)
    for (const o of OPTIONS) expect(p).toContain(o)
    expect(p).toMatch(/EXACTLY as written/i)
  })

  it("names the candidate's preference so it selects rather than invents", () => {
    // The whole point: the model picks FROM the list, it doesn't compose.
    const p = buildOptionPrompt("How did you hear about us?", OPTIONS, ctx, "LinkedIn")
    expect(p).toContain('preference is "LinkedIn"')
  })

  it("caps a huge option list and says how many were hidden", () => {
    const many = Array.from({ length: 200 }, (_, i) => `Country ${i}`)
    const p = buildOptionPrompt("Country?", many, ctx)
    expect(p).toContain(`${200 - MAX_OPTIONS_IN_PROMPT} more not shown`)
    expect(p).not.toContain("Country 199")
  })

  it("carries the honesty rule", () => {
    expect(buildOptionPrompt("Q", OPTIONS)).toMatch(/Do not invent/i)
  })
})

describe("buildTextualPrompt / buildNumericPrompt / buildCheckboxPrompt", () => {
  it("respects a character limit when the form has one", () => {
    expect(buildTextualPrompt("Why us?", ctx, 300)).toContain("at most 300 characters")
  })

  it("asks for digits only", () => {
    expect(buildNumericPrompt("Years of experience?", ctx)).toMatch(/digits only/i)
  })

  it("offers a numeric default when there's no basis", () => {
    expect(buildNumericPrompt("Years?", ctx, 3)).toContain("answer 3")
  })

  it("constrains a checkbox reply to one word", () => {
    expect(buildCheckboxPrompt("Subscribe to updates?", ctx)).toMatch(/exactly one word/i)
  })
})

describe("retry prompts", () => {
  it("includes the rejected answer and the form's own error", () => {
    const p = buildOptionRetryPrompt("Country?", OPTIONS, "Narnia", "Please select a valid country", ctx)
    expect(p).toContain("REJECTED")
    expect(p).toContain("Narnia")
    expect(p).toContain("Please select a valid country")
    expect(p).toMatch(/Do not repeat the rejected answer/i)
  })

  it("still lists the options after the retry preamble", () => {
    const p = buildOptionRetryPrompt("Country?", OPTIONS, "Narnia", "invalid", ctx)
    for (const o of OPTIONS) expect(p).toContain(o)
  })

  it("works for textual answers too", () => {
    const p = buildTextualRetryPrompt("Why us?", "Because.", "Answer is too short", ctx)
    expect(p).toContain("Answer is too short")
    expect(p).toContain("Because.")
  })
})

describe("matchReplyToOption", () => {
  it("matches an exact reply", () => {
    expect(matchReplyToOption("LinkedIn", OPTIONS)).toBe(2)
  })

  it("tolerates numbering, quotes and trailing punctuation", () => {
    expect(matchReplyToOption("3. LinkedIn", OPTIONS)).toBe(2)
    expect(matchReplyToOption('"LinkedIn"', OPTIONS)).toBe(2)
    expect(matchReplyToOption("LinkedIn.", OPTIONS)).toBe(2)
  })

  it("accepts a bare option number", () => {
    expect(matchReplyToOption("4", OPTIONS)).toBe(3)
  })

  it("is case- and punctuation-insensitive", () => {
    expect(matchReplyToOption("job board", OPTIONS)).toBe(3)
    expect(matchReplyToOption("Job-Board", OPTIONS)).toBe(3)
  })

  it("matches Yes/No on the leading token so No never selects Norway", () => {
    const countries = ["Norway", "No", "Yes, I am authorized"]
    expect(matchReplyToOption("No", countries)).toBe(1)
    expect(matchReplyToOption("Yes", countries)).toBe(2)
  })

  it("refuses a weak match rather than picking a wrong option", () => {
    // Selecting the wrong option submits a wrong answer on a real application,
    // so below the confidence floor it must return -1.
    expect(matchReplyToOption("Something entirely unrelated", OPTIONS)).toBe(-1)
  })

  it("returns -1 for empty input", () => {
    expect(matchReplyToOption("", OPTIONS)).toBe(-1)
    expect(matchReplyToOption("LinkedIn", [])).toBe(-1)
  })
})

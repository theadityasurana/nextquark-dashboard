import { describe, expect, it } from "vitest"
import {
  captureAnswer,
  coverage,
  deriveProfileAnswers,
  isSensitiveQuestion,
  normalizeQuestion,
  questionIntent,
  recallAnswer,
  type ApplicationAnswer,
} from "./application-answers"

const bank = (...entries: Array<Partial<ApplicationAnswer> & { question: string; answer: string }>): ApplicationAnswer[] =>
  entries.map((e) => ({
    source: "captured" as const,
    intent: questionIntent(e.question),
    isSensitive: isSensitiveQuestion(e.question),
    ...e,
  }))

describe("normalizeQuestion", () => {
  it("folds punctuation, case and whitespace", () => {
    expect(normalizeQuestion("  Why do YOU want to work here?? ")).toBe("why do you want to work here")
  })
})

describe("questionIntent", () => {
  it("recognizes the common application intents", () => {
    expect(questionIntent("Will you require visa sponsorship?")).toBe("sponsorship")
    expect(questionIntent("Are you legally authorized to work in the US?")).toBe("work_auth")
    expect(questionIntent("What are your salary expectations?")).toBe("salary_expectation")
    expect(questionIntent("When can you start?")).toBe("start_date")
    expect(questionIntent("Are you willing to relocate?")).toBe("relocation")
    expect(questionIntent("How did you hear about us?")).toBe("referral")
  })

  it("returns null for an unrecognized question", () => {
    expect(questionIntent("Describe your favourite deployment pipeline.")).toBeNull()
  })

  it("keeps sponsorship and work_auth distinct", () => {
    // Both mention working legally; conflating them would answer the wrong one.
    expect(questionIntent("Do you now or will you require sponsorship?")).toBe("sponsorship")
    expect(questionIntent("Are you authorized to work without restriction?")).toBe("work_auth")
  })
})

describe("isSensitiveQuestion", () => {
  it("flags the legally consequential questions", () => {
    expect(isSensitiveQuestion("Have you ever been convicted of a felony?")).toBe(true)
    expect(isSensitiveQuestion("Do you hold an active security clearance?")).toBe(true)
    expect(isSensitiveQuestion("Are you a US citizen?")).toBe(true)
    expect(isSensitiveQuestion("Do you have a disability?")).toBe(true)
    expect(isSensitiveQuestion("What is your current salary?")).toBe(true)
  })

  it("does not flag ordinary questions", () => {
    expect(isSensitiveQuestion("What are your salary expectations?")).toBe(false)
    expect(isSensitiveQuestion("Why do you want to work here?")).toBe(false)
  })

  it("separates salary history from salary expectation", () => {
    // Current salary is illegal to ask in several US states; expected salary is not.
    expect(isSensitiveQuestion("What is your current compensation?")).toBe(true)
    expect(isSensitiveQuestion("What is your desired compensation?")).toBe(false)
  })
})

describe("deriveProfileAnswers", () => {
  it("derives work authorization and infers the sponsorship answer", () => {
    const a = deriveProfileAnswers({ work_authorization_status: "US Citizen" })
    expect(a.find((x) => x.intent === "work_auth")?.answer).toBe("US Citizen")
    expect(a.find((x) => x.intent === "sponsorship")?.answer).toBe("No")
  })

  it("infers Yes for a candidate who needs sponsorship", () => {
    const a = deriveProfileAnswers({ work_authorization_status: "F-1 OPT" })
    expect(a.find((x) => x.intent === "sponsorship")?.answer).toBe("Yes")
  })

  it("stays silent on sponsorship when the status is ambiguous", () => {
    // Never fabricate: an unclassifiable status yields no sponsorship claim.
    const a = deriveProfileAnswers({ work_authorization_status: "Other" })
    expect(a.find((x) => x.intent === "sponsorship")).toBeUndefined()
  })

  it("formats a salary range and a single-sided range", () => {
    expect(
      deriveProfileAnswers({ salary_currency: "USD", salary_min: 120000, salary_max: 160000 })
        .find((x) => x.intent === "salary_expectation")?.answer
    ).toContain("120,000")
    expect(
      deriveProfileAnswers({ salary_currency: "USD", salary_max: 160000 })
        .find((x) => x.intent === "salary_expectation")?.answer
    ).toContain("160,000")
  })

  it("emits nothing for fields the candidate has not filled in", () => {
    expect(deriveProfileAnswers({})).toHaveLength(0)
    expect(deriveProfileAnswers({ work_authorization_status: "   " })).toHaveLength(0)
  })

  it("marks derived EEO answers sensitive", () => {
    const a = deriveProfileAnswers({ gender: "Female", disability_status: "No" })
    expect(a.every((x) => x.isSensitive)).toBe(true)
  })
})

describe("recallAnswer", () => {
  it("returns null against an empty bank", () => {
    expect(recallAnswer([], "Why do you want to work here?")).toBeNull()
  })

  it("matches exact question text at full confidence", () => {
    const b = bank({ question: "Why do you want to work here?", answer: "Because X." })
    const r = recallAnswer(b, "why do you WANT to work here??")
    expect(r?.confidence).toBe(1)
    expect(r?.answer).toBe("Because X.")
  })

  it("matches a paraphrase by shared intent", () => {
    const b = bank({ question: "Will you require visa sponsorship?", answer: "No" })
    const r = recallAnswer(b, "Do you now or in the future need immigration sponsorship?")
    expect(r?.answer).toBe("No")
    expect(r?.confidence).toBe(0.85)
  })

  it("falls back to fuzzy overlap for unrecognized questions", () => {
    const b = bank({
      question: "Describe your experience with distributed systems",
      answer: "Six years building them.",
    })
    const r = recallAnswer(b, "Please describe your distributed systems experience")
    expect(r?.answer).toBe("Six years building them.")
    expect(r!.confidence).toBeLessThanOrEqual(0.8)
  })

  it("does not fuzzy-match two unrelated questions", () => {
    const b = bank({ question: "Describe your experience with Kubernetes", answer: "A lot." })
    expect(recallAnswer(b, "Describe your favourite book")).toBeNull()
  })

  it("never fuzzy-matches a sensitive question", () => {
    // Token overlap is high, but answering a felony question from a clearance
    // answer would be a real harm. Must return null so a human is asked.
    const b = bank({ question: "Have you ever been convicted of a crime?", answer: "No" })
    expect(recallAnswer(b, "Have you ever been convicted of a felony or misdemeanor?")?.confidence).toBe(0.85)
    expect(recallAnswer(bank({ question: "Do you hold a security clearance?", answer: "No" }), "Have you ever been convicted of a felony?")).toBeNull()
  })

  it("never uses a stored sensitive answer to fuzzy-fill another question", () => {
    const b = bank({ question: "Are you a US citizen?", answer: "Yes" })
    expect(recallAnswer(b, "Are you a member of a professional society?")).toBeNull()
  })

  it("prefers the exact match over an intent sibling", () => {
    const b = bank(
      { question: "What are your salary expectations?", answer: "USD 150k" },
      { question: "Desired compensation", answer: "USD 999k" }
    )
    expect(recallAnswer(b, "What are your salary expectations?")?.answer).toBe("USD 150k")
  })
})

describe("captureAnswer", () => {
  it("appends a new answer without mutating the input", () => {
    const before: ApplicationAnswer[] = []
    const after = captureAnswer(before, "Why us?", "Because Y.")
    expect(before).toHaveLength(0)
    expect(after).toHaveLength(1)
    expect(after[0].source).toBe("captured")
  })

  it("updates in place when the question is already known", () => {
    const b = bank({ question: "Why us?", answer: "Old" })
    const after = captureAnswer(b, "why us??", "New")
    expect(after).toHaveLength(1)
    expect(after[0].answer).toBe("New")
  })

  it("tags intent and sensitivity on capture", () => {
    // A sensitive answer needs explicit remember-consent before it is retained.
    // Using it on one form was never permission to keep it on file.
    const [a] = captureAnswer([], "Have you been convicted of a felony?", "No", "captured", {
      rememberSensitive: true,
    })
    expect(a.isSensitive).toBe(true)
    expect(a.intent).toBe("criminal_history")
  })

  it("does not retain a sensitive answer when consent was not given", () => {
    expect(captureAnswer([], "Have you been convicted of a felony?", "No")).toHaveLength(0)
  })
})

describe("coverage", () => {
  it("reports full coverage when everything is answerable", () => {
    const b = bank({ question: "Why us?", answer: "Y" })
    expect(coverage(b, ["Why us?"]).percent).toBe(100)
  })

  it("lists unanswered questions", () => {
    const c = coverage([], ["Why us?", "When can you start?"])
    expect(c.answered).toBe(0)
    expect(c.unanswered).toHaveLength(2)
  })

  it("separates sensitive unanswered questions as needing a human", () => {
    const c = coverage([], ["Describe your setup", "Have you been convicted of a felony?"])
    expect(c.needsHuman).toEqual(["Have you been convicted of a felony?"])
    expect(c.unanswered).toHaveLength(2)
  })

  it("treats an empty question list as fully covered", () => {
    expect(coverage([], []).percent).toBe(100)
  })
})

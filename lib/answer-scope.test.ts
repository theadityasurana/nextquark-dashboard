import { describe, expect, it } from "vitest"
import {
  captureAnswer,
  defaultScopeFor,
  deriveProfileAnswers,
  recallAnswer,
  scopeMatches,
  stateOf,
  type ApplicationAnswer,
} from "./application-answers"

const answer = (over: Partial<ApplicationAnswer> = {}): ApplicationAnswer => ({
  question: "Are you legally authorized to work?",
  answer: "Yes",
  intent: "work_auth",
  source: "captured",
  state: "confirmed",
  scope: { kind: "global", value: null },
  ...over,
})

describe("defaultScopeFor", () => {
  it("scopes 'why this company' to the employer", () => {
    const s = defaultScopeFor("Why do you want to work at Acme?", { employer: "Acme" })
    expect(s.kind).toBe("employer")
    expect(s.value).toBe("Acme")
  })

  it("scopes 'why this role' and referral source to the employer too", () => {
    expect(defaultScopeFor("Why this role?", { employer: "Acme" }).kind).toBe("employer")
    expect(defaultScopeFor("How did you hear about us?", { employer: "Acme" }).kind).toBe("employer")
  })

  it("leaves genuinely universal questions global", () => {
    expect(defaultScopeFor("Are you legally authorized to work?").kind).toBe("global")
    expect(defaultScopeFor("What is your notice period?").kind).toBe("global")
    expect(defaultScopeFor("LinkedIn profile URL").kind).toBe("global")
  })
})

describe("scopeMatches", () => {
  it("always admits a global answer", () => {
    expect(scopeMatches({ kind: "global" }, { employer: "Acme" })).toBe(true)
    expect(scopeMatches(undefined, {})).toBe(true)
  })

  it("admits an employer answer only for that employer", () => {
    expect(scopeMatches({ kind: "employer", value: "Acme" }, { employer: "Acme" })).toBe(true)
    expect(scopeMatches({ kind: "employer", value: "acme" }, { employer: "ACME" })).toBe(true)
    expect(scopeMatches({ kind: "employer", value: "Acme" }, { employer: "Globex" })).toBe(false)
  })

  it("refuses a narrowed scope with no value recorded", () => {
    // "Some employer, we don't know which" is exactly the case scope exists to
    // prevent, so an unrecorded value must not match anything.
    expect(scopeMatches({ kind: "employer", value: null }, { employer: "Acme" })).toBe(false)
    expect(scopeMatches({ kind: "employer", value: "Acme" }, {})).toBe(false)
  })
})

describe("recallAnswer with scope", () => {
  it("never reuses one employer's answer for another", () => {
    const bank = [
      answer({
        question: "Why do you want to work at Acme?",
        answer: "I admire Acme's payments infrastructure.",
        intent: "why_company",
        scope: { kind: "employer", value: "Acme" },
      }),
    ]
    expect(recallAnswer(bank, "Why do you want to work at Acme?", { employer: "Acme" })?.answer).toContain("Acme")
    // The two questions share almost every content token — no fuzzy threshold
    // could separate them, which is why this is a structural rule.
    expect(recallAnswer(bank, "Why do you want to join Globex?", { employer: "Globex" })).toBeNull()
  })

  it("still reuses a global answer everywhere", () => {
    const bank = [answer()]
    expect(recallAnswer(bank, "Are you legally authorized to work?", { employer: "Globex" })?.answer).toBe("Yes")
  })

  it("marks a confirmed non-sensitive in-scope answer as reusable without asking", () => {
    const r = recallAnswer([answer()], "Are you legally authorized to work?", { employer: "Acme" })
    expect(r?.state).toBe("confirmed")
    expect(r?.reusableWithoutAsking).toBe(true)
  })

  it("flags an inferred answer for review even though it still fills", () => {
    const r = recallAnswer([answer({ state: "inferred", source: "derived" })], "Are you legally authorized to work?")
    expect(r?.answer).toBe("Yes")
    expect(r?.reusableWithoutAsking).toBe(false)
  })

  it("flags a sensitive answer for review", () => {
    const bank = [answer({ question: "Are you a US citizen?", answer: "No", intent: "citizenship", isSensitive: true, state: "sensitive" })]
    const r = recallAnswer(bank, "Are you a US citizen?")
    expect(r?.reusableWithoutAsking).toBe(false)
  })

  it("does not fuzzy-match an employer-scoped answer onto anything", () => {
    const bank = [
      answer({
        question: "Why do you want to work at Acme?",
        answer: "x",
        intent: null,
        scope: { kind: "employer", value: "Acme" },
      }),
    ]
    // Even in the right employer context, fuzzy tier must skip scoped answers.
    expect(recallAnswer(bank, "What do you want from your next job at Acme?", { employer: "Acme" })).toBeNull()
  })
})

describe("captureAnswer and the remember-consent split", () => {
  it("stores an ordinary answer as confirmed", () => {
    const bank = captureAnswer([], "What is your notice period?", "30 days")
    expect(bank).toHaveLength(1)
    expect(bank[0].state).toBe("confirmed")
  })

  it("refuses to store a sensitive answer without explicit remember-consent", () => {
    // Permission to put a disability disclosure on ONE form is not permission
    // to keep it on file. The caller may still use the value for that form.
    const bank = captureAnswer([], "Do you have a disability?", "No")
    expect(bank).toHaveLength(0)
  })

  it("stores a sensitive answer when consent is explicit, and stamps when", () => {
    const bank = captureAnswer([], "Do you have a disability?", "No", "captured", { rememberSensitive: true })
    expect(bank).toHaveLength(1)
    expect(bank[0].state).toBe("sensitive")
    expect(bank[0].rememberConsentAt).toBeTruthy()
  })

  it("records the scope it was captured under", () => {
    const bank = captureAnswer([], "Why do you want to work here?", "Because…", "captured", {
      context: { employer: "Acme" },
    })
    expect(bank[0].scope).toEqual({ kind: "employer", value: "Acme" })
  })

  it("updates in place rather than duplicating a re-answered question", () => {
    const first = captureAnswer([], "Notice period?", "30 days")
    const second = captureAnswer(first, "notice period??", "60 days")
    expect(second).toHaveLength(1)
    expect(second[0].answer).toBe("60 days")
  })
})

describe("stateOf", () => {
  it("defaults a row written before states existed to the safe reading", () => {
    expect(stateOf({ question: "q", answer: "a", source: "derived" })).toBe("inferred")
    expect(stateOf({ question: "q", answer: "a", source: "captured" })).toBe("confirmed")
    expect(stateOf({ question: "q", answer: "a", source: "operator" })).toBe("confirmed")
    expect(stateOf({ question: "q", answer: "a", source: "llm" })).toBe("inferred")
  })

  it("treats a sensitive row as sensitive whatever its source", () => {
    expect(stateOf({ question: "q", answer: "a", source: "captured", isSensitive: true })).toBe("sensitive")
  })
})

describe("deriveProfileAnswers states", () => {
  it("marks a value the candidate entered as confirmed and one we deduced as inferred", () => {
    const derived = deriveProfileAnswers({ work_authorization_status: "US Citizen" })
    const auth = derived.find((a) => a.intent === "work_auth")
    const sponsorship = derived.find((a) => a.intent === "sponsorship")
    expect(auth?.state).toBe("confirmed")
    // We inferred "No sponsorship needed" FROM "US Citizen" — the deduction is
    // ours and could be wrong, so it must not present as human-confirmed.
    expect(sponsorship?.state).toBe("inferred")
  })

  it("marks self-ID answers sensitive even though the profile provided them", () => {
    const derived = deriveProfileAnswers({ gender: "Female", disability_status: "No" })
    expect(derived.every((a) => a.state === "sensitive")).toBe(true)
  })
})

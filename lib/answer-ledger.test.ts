import { describe, it, expect } from "vitest"
import { AnswerLedger, normalizeQuestion } from "./answer-ledger"

describe("normalizeQuestion", () => {
  it("survives the cosmetic drift a form applies between scans", () => {
    const a = normalizeQuestion("Are you authorized to work? *")
    expect(normalizeQuestion("Are you authorized to work?")).toBe(a)
    expect(normalizeQuestion("Are  you   authorized to work? ✱")).toBe(a)
    expect(normalizeQuestion("Are you authorized to work? (required)")).toBe(a)
  })
})

describe("one answer per question, forever", () => {
  it("reuses the first answer when the same question appears under a new key", () => {
    const l = new AnswerLedger()
    l.record("id:q1", "Why do you want to work here?", "First answer.", "llm")
    // Page 4 asks the same thing under a different DOM id.
    const got = l.record("id:q99", "Why do you want to work here? *", "A DIFFERENT answer.", "llm")
    expect(got).toBe("First answer.")
    expect(l.get("id:q99")).toBe("First answer.")
  })

  it("resolves a question by text even when the key is unknown", () => {
    const l = new AnswerLedger()
    l.record("id:q1", "Notice period", "30 days", "deterministic")
    expect(l.get("id:brand-new", "Notice period")).toBe("30 days")
  })

  it("lets a real answer replace a previously empty one", () => {
    const l = new AnswerLedger()
    l.record("id:q1", "Salary", "", "llm")
    expect(l.record("id:q1", "Salary", "INR 2000000", "llm")).toBe("INR 2000000")
  })

  it("reports whether a question already has an answer", () => {
    const l = new AnswerLedger()
    expect(l.hasAnswerFor("Notice period")).toBe(false)
    l.record("id:q1", "Notice period", "30 days", "deterministic")
    expect(l.hasAnswerFor("notice period")).toBe(true)
  })
})

describe("fill once, move on", () => {
  it("treats a settled field as resolved and never re-queues it", () => {
    const l = new AnswerLedger()
    l.settle("id:phone")
    expect(l.isSettled("id:phone")).toBe(true)
    expect(l.isResolved("id:phone")).toBe(true)
  })

  it("does not unsettle a field just because another one failed", () => {
    const l = new AnswerLedger()
    l.record("id:phone", "Phone", "+91...", "profile")
    l.record("id:email", "Email", "a@b.com", "profile")
    l.settle("id:phone")
    l.settle("id:email")
    const reopened = l.unsettleFromErrors(["Email is invalid"])
    expect(reopened).toEqual(["id:email"])
    expect(l.isSettled("id:phone")).toBe(true)
  })

  it("only reopens on an error that actually names the field", () => {
    const l = new AnswerLedger()
    l.record("id:phone", "Phone", "+91...", "profile")
    l.settle("id:phone")
    expect(l.unsettleFromErrors(["Something went wrong"])).toEqual([])
    expect(l.isSettled("id:phone")).toBe(true)
  })

  it("clears the attempt count when a field is reopened, so it gets a fair retry", () => {
    const l = new AnswerLedger(3)
    l.record("id:phone", "Phone", "+91...", "profile")
    l.countAttempt("id:phone")
    l.countAttempt("id:phone")
    l.settle("id:phone")
    l.unsettleFromErrors(["Phone"])
    expect(l.attemptsFor("id:phone")).toBe(0)
  })
})

describe("attempt budget", () => {
  it("is per run, not per round", () => {
    const l = new AnswerLedger(3)
    expect(l.countAttempt("k")).toEqual({ attempts: 1, exhausted: false })
    expect(l.countAttempt("k")).toEqual({ attempts: 2, exhausted: false })
    expect(l.countAttempt("k")).toEqual({ attempts: 3, exhausted: true })
  })
})

describe("blocked is not the same as filled", () => {
  it("keeps an unanswerable required field visible to the submit gate", () => {
    const l = new AnswerLedger()
    l.block({ key: "id:q1", label: "Why us?", kind: "unanswerable", detail: "model unreachable", required: true })
    // Resolved for the loop — it should not be retried forever …
    expect(l.isResolved("id:q1")).toBe(true)
    // … but NOT settled, so the submit gate still sees it.
    expect(l.isSettled("id:q1")).toBe(false)
    expect(l.requiredBlockers()).toHaveLength(1)
  })

  it("does not let an optional blocker stop a submit", () => {
    const l = new AnswerLedger()
    l.block({ key: "id:q2", label: "Twitter", kind: "unanswerable", detail: "no value", required: false })
    expect(l.requiredBlockers()).toHaveLength(0)
    expect(l.allBlockers()).toHaveLength(1)
  })

  it("separates human-required questions from ones we simply failed", () => {
    const l = new AnswerLedger()
    l.block({ key: "a", label: "Race", kind: "human-required", detail: "eeo", required: false })
    l.block({ key: "b", label: "Why us?", kind: "unanswerable", detail: "model down", required: true })
    expect(l.humanRequired().map(x => x.label)).toEqual(["Race"])
  })

  it("settling a blocked field clears the blocker", () => {
    const l = new AnswerLedger()
    l.block({ key: "k", label: "X", kind: "undrivable", detail: "d", required: true })
    l.settle("k")
    expect(l.requiredBlockers()).toHaveLength(0)
    expect(l.isSettled("k")).toBe(true)
  })

  it("never blocks a field that is already settled", () => {
    const l = new AnswerLedger()
    l.settle("k")
    l.block({ key: "k", label: "X", kind: "undrivable", detail: "d", required: true })
    expect(l.allBlockers()).toHaveLength(0)
  })
})

describe("reporting", () => {
  it("summarises how answers were produced", () => {
    const l = new AnswerLedger()
    l.record("a", "First Name", "Aditya", "profile")
    l.record("b", "Last Name", "Surana", "profile")
    l.record("c", "Why us?", "Because…", "llm")
    expect(l.methodSummary()).toEqual({ profile: 2, llm: 1 })
  })
})

describe("unsettling is narrow", () => {
  it("does not reopen a short-labelled field on an unrelated error", () => {
    const l = new AnswerLedger()
    l.record("id:dob", "DOB", "1999-01-01", "deterministic")
    l.record("id:email", "Email address", "a@b.com", "profile")
    l.settle("id:dob")
    l.settle("id:email")
    // "Email address is required" must not drag DOB along with it.
    const reopened = l.unsettleFromErrors(["Email address is required"])
    expect(reopened).toEqual(["id:email"])
    expect(l.isSettled("id:dob")).toBe(true)
  })

  it("still reopens a short label on an exact match", () => {
    const l = new AnswerLedger()
    l.record("id:dob", "DOB", "x", "deterministic")
    l.settle("id:dob")
    expect(l.unsettleFromErrors(["DOB"])).toEqual(["id:dob"])
  })
})

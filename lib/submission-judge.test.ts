import { describe, expect, it } from "vitest"
import {
  buildJudgePrompt,
  parseJudgeReply,
  reconcile,
  RESOLVE_THRESHOLD,
  type SubmissionEvidence,
} from "./submission-judge"

const evidence = (over: Partial<SubmissionEvidence> = {}): SubmissionEvidence => ({
  portal: "Greenhouse",
  finalUrl: "https://boards.greenhouse.io/acme/jobs/1/confirmation",
  startUrl: "https://boards.greenhouse.io/acme/jobs/1",
  bodyText: "Thank you for applying.",
  submitClicked: true,
  visibleInputs: 0,
  submitStillVisible: false,
  validationErrors: [],
  confirmationId: "R-1043928",
  timeline: ["step 1: 12/12 filled"],
  ...over,
})

describe("buildJudgePrompt", () => {
  it("includes the structural evidence and never our own verdict", () => {
    const p = buildJudgePrompt(evidence())
    expect(p).toContain("Greenhouse")
    expect(p).toContain("R-1043928")
    expect(p).toContain("Submit control was clicked: yes")
    // The judge must not be told what confirmSubmission decided, or it will
    // simply agree with it.
    expect(p).not.toMatch(/confidence.*(high|medium|low)/i)
  })

  it("says 'none' rather than leaving a blank where there are no errors", () => {
    expect(buildJudgePrompt(evidence())).toContain("Validation errors on the page: none")
  })

  it("truncates a huge page body", () => {
    const p = buildJudgePrompt(evidence({ bodyText: "x".repeat(9000) }))
    expect(p.length).toBeLessThan(6000)
  })
})

describe("parseJudgeReply", () => {
  it("parses a clean JSON verdict", () => {
    const r = parseJudgeReply('{"verdict":"submitted","confidence":0.92,"reason":"Confirmation page with a reference number"}')
    expect(r.verdict).toBe("submitted")
    expect(r.confidence).toBeCloseTo(0.92)
    expect(r.reason).toContain("reference number")
  })

  it("parses JSON wrapped in prose or a code fence", () => {
    const r = parseJudgeReply('Here is my verdict:\n```json\n{"verdict":"not_submitted","confidence":0.8,"reason":"Form still visible"}\n```')
    expect(r.verdict).toBe("not_submitted")
    expect(r.confidence).toBeCloseTo(0.8)
  })

  it("rescales a 0-100 confidence", () => {
    expect(parseJudgeReply('{"verdict":"submitted","confidence":85,"reason":"x"}').confidence).toBeCloseTo(0.85)
  })

  it("abstains on anything unparseable, rather than guessing", () => {
    for (const bad of [null, undefined, "", "I think it worked", "{not json"]) {
      const r = parseJudgeReply(bad as any)
      expect(r.verdict).toBe("uncertain")
      expect(r.confidence).toBe(0)
    }
  })

  it("clamps an out-of-range confidence", () => {
    expect(parseJudgeReply('{"verdict":"submitted","confidence":-3,"reason":"x"}').confidence).toBe(0)
    expect(parseJudgeReply('{"verdict":"submitted","confidence":1.5,"reason":"x"}').confidence).toBeLessThanOrEqual(1)
  })

  it("maps an unrecognized verdict string to uncertain", () => {
    expect(parseJudgeReply('{"verdict":"maybe","confidence":0.9,"reason":"x"}').verdict).toBe("uncertain")
  })
})

describe("reconcile", () => {
  it("upgrades when the judge confidently agrees", () => {
    expect(reconcile(true, { verdict: "submitted", confidence: 0.9, reason: "" })).toBe("upgrade")
  })

  it("downgrades when the judge confidently disagrees", () => {
    expect(reconcile(true, { verdict: "not_submitted", confidence: 0.85, reason: "" })).toBe("downgrade")
  })

  it("leaves the rules verdict alone below the confidence floor", () => {
    // A low-confidence contradiction is not evidence. Flip-flopping on weak
    // signals would be worse than the rules layer alone.
    const justUnder = RESOLVE_THRESHOLD - 0.01
    expect(reconcile(true, { verdict: "not_submitted", confidence: justUnder, reason: "" })).toBe("unchanged")
    expect(reconcile(true, { verdict: "submitted", confidence: justUnder, reason: "" })).toBe("unchanged")
  })

  it("leaves the rules verdict alone when the judge abstains", () => {
    expect(reconcile(true, { verdict: "uncertain", confidence: 0.99, reason: "" })).toBe("unchanged")
  })
})

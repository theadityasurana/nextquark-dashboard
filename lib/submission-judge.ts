/**
 * An independent second opinion on whether an application actually submitted.
 *
 * `confirmSubmission` is a rules engine: URL patterns, body-text patterns, and
 * whether the form disappeared. It is a good first layer, but it keys on
 * phrases like "thank you" — which appear on plenty of pages that did not
 * accept an application, and are absent from plenty that did. Its own
 * `medium` bucket is the honest admission of that: those runs are currently
 * flagged for a human to spot-check.
 *
 * This module is the auditor for that bucket. It is deliberately framed the way
 * AutoApply-AI frames its judge — *do not trust the agent's own claim* — and
 * that scepticism applies just as much to our rules layer as to an LLM agent.
 * The judge sees the evidence, not the verdict: it is never told what
 * `confirmSubmission` decided, so it cannot simply agree with it.
 *
 * Only the pure halves live here plus one thin IO function, so the prompt
 * construction and the reply parsing are unit-testable with no model call.
 */

export type JudgeVerdict = "submitted" | "not_submitted" | "uncertain"

export interface JudgeResult {
  verdict: JudgeVerdict
  /** 0..1. Below RESOLVE_THRESHOLD the judge is treated as abstaining. */
  confidence: number
  reason: string
}

/** The evidence a judge sees. Deliberately excludes our own verdict. */
export interface SubmissionEvidence {
  portal: string
  /** Where the browser ended up. */
  finalUrl: string
  /** The URL the run started at, for "did we actually move" reasoning. */
  startUrl: string
  /** Post-submit page text, already truncated by the caller. */
  bodyText: string
  /** Whether a Submit-like button was clicked at all. */
  submitClicked: boolean
  /** Fillable inputs still visible after the click. */
  visibleInputs: number
  /** Whether a submit control is still on the page. */
  submitStillVisible: boolean
  /** Validation errors read off the page after the click, if any. */
  validationErrors: string[]
  /** Reference the ATS printed, when one was extracted. */
  confirmationId: string | null
  /** Compact per-phase run history, e.g. "prefill ok · ai_fill ok · submit ok". */
  timeline: string[]
}

/**
 * Below this the judge is treated as having no opinion, and the rules layer's
 * verdict stands. Set high on purpose: a low-confidence contradiction is not
 * evidence, and flip-flopping on weak signals would be worse than the rules
 * alone.
 */
export const RESOLVE_THRESHOLD = 0.7

export function buildJudgePrompt(e: SubmissionEvidence): string {
  const errors = e.validationErrors.length ? e.validationErrors.join("; ") : "none"
  return `You are auditing whether a job application was actually submitted.

Judge ONLY from the evidence below. Do not assume success because an automation
ran to completion — automated runs over-report success. A page can say "thank
you" without having accepted an application, and a real confirmation can omit
those words entirely. Weigh the structural evidence (did the form disappear, did
the URL change to a confirmation route, was a reference number issued) above the
wording.

ATS portal: ${e.portal}
Start URL: ${e.startUrl}
Final URL: ${e.finalUrl}
Submit control was clicked: ${e.submitClicked ? "yes" : "no"}
Fillable inputs still visible afterwards: ${e.visibleInputs}
Submit button still visible afterwards: ${e.submitStillVisible ? "yes" : "no"}
Validation errors on the page: ${errors}
Reference/confirmation ID found: ${e.confirmationId ?? "none"}

Run phases: ${e.timeline.join(" · ") || "not recorded"}

Page text after the attempt:
"""
${e.bodyText.slice(0, 2000)}
"""

Answer with strict JSON only, no prose:
{"verdict":"submitted"|"not_submitted"|"uncertain","confidence":0.0-1.0,"reason":"one sentence"}`
}

/**
 * Parse a model reply into a verdict.
 *
 * Tolerant of the usual wrappers (fenced code, leading prose) because the
 * fallback chain includes models without guaranteed JSON mode. Anything
 * unparseable becomes `uncertain` at zero confidence, which is exactly the
 * abstention the caller wants — never a coin-flip verdict.
 */
export function parseJudgeReply(raw: string | null | undefined): JudgeResult {
  const abstain: JudgeResult = { verdict: "uncertain", confidence: 0, reason: "Judge returned no parseable verdict" }
  if (!raw) return abstain

  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return abstain

  let parsed: any
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return abstain
  }

  const v = String(parsed?.verdict ?? "").toLowerCase()
  const verdict: JudgeVerdict =
    v === "submitted" ? "submitted" : v === "not_submitted" ? "not_submitted" : "uncertain"

  let confidence = Number(parsed?.confidence)
  if (!Number.isFinite(confidence)) confidence = 0
  // Models occasionally answer on a 0-100 scale despite the instruction.
  if (confidence > 1) confidence = confidence / 100
  confidence = Math.max(0, Math.min(1, confidence))

  const reason = String(parsed?.reason ?? "").slice(0, 300) || "No reason given"
  // A verdict the model itself won't stand behind is an abstention.
  if (verdict === "uncertain") return { verdict, confidence, reason }
  return { verdict, confidence, reason }
}

/** What the caller should do with the rules-layer verdict. */
export type JudgeOutcome =
  /** Judge agreed — treat as submitted with high confidence. */
  | "upgrade"
  /** Judge disagreed — downgrade to needs-review, do not report success. */
  | "downgrade"
  /** Judge abstained or was too unsure — leave the rules verdict alone. */
  | "unchanged"

/**
 * Reconcile the judge against the rules-layer verdict.
 *
 * Only ever called for the `medium` bucket, so `rulesSaidSubmitted` is true by
 * construction; keeping it as a parameter makes the function total and lets
 * the table be tested exhaustively.
 */
export function reconcile(rulesSaidSubmitted: boolean, judge: JudgeResult): JudgeOutcome {
  if (judge.confidence < RESOLVE_THRESHOLD) return "unchanged"
  if (judge.verdict === "uncertain") return "unchanged"
  const judgeSaysSubmitted = judge.verdict === "submitted"
  if (judgeSaysSubmitted === rulesSaidSubmitted) return rulesSaidSubmitted ? "upgrade" : "unchanged"
  return judgeSaysSubmitted ? "unchanged" : "downgrade"
}

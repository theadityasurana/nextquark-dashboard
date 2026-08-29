/**
 * Multi-page application wizards as control flow, not prose.
 *
 * Workday, Taleo and iCIMS spread one application across five or six pages.
 * Until now that was handled by a sentence in the agent instruction ("Each
 * page: fill required fields, then click Next"), which meant the structured
 * fill plan, the coverage tracking and the audit gate all applied to page 1 and
 * nothing else. Everything after the first Next was unobserved.
 *
 * This module supplies the three pure decisions a real wizard loop needs:
 *
 *   1. {@link classifyControl} — is this button an *advance* ("Next", "Save and
 *      Continue") or the *final action* ("Submit Application")? Clicking a
 *      final action believing it was an advance submits a half-filled form;
 *      clicking an advance believing it was final leaves the run hanging on a
 *      page that never confirms. The distinction has to be explicit.
 *
 *   2. {@link fingerprintPage} — a stable hash of "which page am I on",
 *      computed from the URL plus the set of control keys. This is what tells
 *      an advance click apart from a no-op: same fingerprint after clicking
 *      Next means the page did not change.
 *
 *   3. {@link StepTracker} — the bounded loop guard. It records each step's
 *      fingerprint and answers two questions: have we been here before (a
 *      cycle), and have we stopped making progress (a stall).
 *
 * All pure and DOM-free, so the wizard's decision logic is unit-testable
 * without a browser.
 */

/** How a button behaves in a multi-step flow. */
export type ControlKind =
  /** Moves to the next step. Safe to click repeatedly across a wizard. */
  | "advance"
  /** Submits the application. Irreversible — only ever clicked once, at the end. */
  | "final"
  /** Goes backwards. Never clicked by the loop. */
  | "back"
  /** Something else entirely (Add another, Upload, Cancel…). */
  | "other"

/**
 * Final-action patterns, checked FIRST.
 *
 * Ordering is the whole safety property here. "Submit application" and
 * "Continue" can both appear on the same review page, and several ATSes label
 * the true final button "Save and Submit" — which contains "Save", an advance
 * word. Testing final patterns before advance patterns means an ambiguous
 * label always resolves to the more conservative reading: treat it as final,
 * and let the audit gate decide whether the form is actually complete.
 */
const FINAL_PATTERNS: RegExp[] = [
  /\bsubmit\b/i,
  /\bsend\s+application\b/i,
  /\bapply\s+now\b/i,
  /\bfinish\s+(?:and\s+)?(?:apply|submit)\b/i,
  /\bcomplete\s+application\b/i,
  /^\s*apply\s*$/i,
]

/** Advance patterns — only reached when nothing above matched. */
const ADVANCE_PATTERNS: RegExp[] = [
  /\bnext\b/i,
  /\bcontinue\b/i,
  /\bsave\s+(?:and|&)\s+continue\b/i,
  /\bsave\s+(?:and|&)\s+next\b/i,
  /\bproceed\b/i,
  /\bstart\s+(?:your\s+)?application\b/i,
  /\breview\b/i,
]

const BACK_PATTERNS: RegExp[] = [/\bback\b/i, /\bprevious\b/i, /\breturn\b/i, /\bcancel\b/i]

/**
 * What kind of control a button label represents.
 *
 * Note the deliberate asymmetry: "Review" counts as an *advance*, because on
 * Workday and iCIMS the review page is a real step that still precedes Submit.
 * Reaching it is progress, not completion.
 */
export function classifyControl(label: string): ControlKind {
  const text = (label || "").replace(/\s+/g, " ").trim()
  if (!text) return "other"
  // Conservative ordering: final wins ties (see FINAL_PATTERNS).
  if (FINAL_PATTERNS.some((re) => re.test(text))) return "final"
  if (ADVANCE_PATTERNS.some((re) => re.test(text))) return "advance"
  if (BACK_PATTERNS.some((re) => re.test(text))) return "back"
  return "other"
}

/** Deterministic FNV-1a hash (base36) — stable across runs and processes. */
function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * Strip the volatile parts of a URL so two views of the same wizard step hash
 * identically. Workday appends a step token to the fragment on every
 * transition and several ATSes carry a per-request `?t=` cache-buster; neither
 * means the page changed.
 */
function stableUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    u.hash = ""
    for (const p of ["t", "ts", "_", "cb", "gh_src", "utm_source", "utm_medium", "utm_campaign"]) {
      u.searchParams.delete(p)
    }
    return `${u.origin}${u.pathname}${u.search}`
  } catch {
    return (rawUrl || "").split("#")[0]
  }
}

/**
 * A stable identity for "the page we are currently filling".
 *
 * URL alone is not enough — a single-page-app wizard swaps the whole form
 * without navigating. The control key set alone is not enough either, because
 * two steps can legitimately ask for the same field names. Hashing both
 * together is what makes "did the page actually change?" answerable.
 */
export function fingerprintPage(url: string, controlKeys: string[]): string {
  const keys = [...new Set(controlKeys.filter(Boolean))].sort().join("|")
  return `${hashString(stableUrl(url))}.${hashString(keys)}.${controlKeys.length}`
}

/** Why the wizard loop stopped. */
export type StopReason =
  /** A final-action control was found — the caller should run the submit gate. */
  | "reached_final"
  /** Clicking advance did not change the page. */
  | "stuck"
  /** We returned to a page already visited — the wizard is cycling. */
  | "cycle"
  /** Hit the configured step ceiling. */
  | "max_steps"
  /** No advance control and no final control — nowhere left to go. */
  | "no_advance"
  /**
   * The final (or advance) control is right there but disabled. The form is
   * incomplete by the portal's own reckoning — a fixable state, unlike the
   * others here.
   */
  | "blocked_final"

export interface StepRecord {
  step: number
  fingerprint: string
  url: string
  fieldCount: number
  filledCount: number
}

/**
 * Bounded progress tracking across wizard steps.
 *
 * Two independent guards, because they catch different failures:
 *
 *  - **stuck**: the fingerprint after an advance click equals the one before.
 *    The click did nothing — usually a validation error we didn't read, or a
 *    disabled button. Re-filling the same page is pure waste.
 *  - **cycle**: the fingerprint matches a step from further back. The wizard
 *    bounced us to an earlier page (Workday does this when a required field on
 *    step 2 fails validation from step 4). Continuing would loop forever.
 */
export class StepTracker {
  private readonly seen = new Map<string, number>()
  private readonly records: StepRecord[] = []

  constructor(readonly maxSteps: number = 8) {}

  get steps(): readonly StepRecord[] {
    return this.records
  }

  get count(): number {
    return this.records.length
  }

  /** True when this fingerprint was already visited on an earlier step. */
  hasSeen(fingerprint: string): boolean {
    return this.seen.has(fingerprint)
  }

  /** The step number a fingerprint was first seen at, or null. */
  firstSeenAt(fingerprint: string): number | null {
    return this.seen.get(fingerprint) ?? null
  }

  record(r: Omit<StepRecord, "step">): StepRecord {
    const entry: StepRecord = { ...r, step: this.records.length + 1 }
    this.records.push(entry)
    if (!this.seen.has(r.fingerprint)) this.seen.set(r.fingerprint, entry.step)
    return entry
  }

  /** True once the step ceiling is reached. */
  get exhausted(): boolean {
    return this.records.length >= this.maxSteps
  }

  /** Operator-facing one-liner for the run timeline. */
  summary(): string {
    if (!this.records.length) return "no steps recorded"
    return this.records
      .map((s) => `#${s.step} ${s.filledCount}/${s.fieldCount} fields`)
      .join(" → ")
  }
}

/**
 * Decide what the loop should do after finishing a page.
 *
 * Pure so the whole wizard policy can be tested as a table. `nextFingerprint`
 * is null when the advance click has not happened yet (the first call on a
 * page); it is set on the follow-up call, once the page has had a chance to
 * change.
 */
export function decideNextStep(input: {
  tracker: StepTracker
  currentFingerprint: string
  /** Fingerprint observed after clicking advance, or null if not clicked yet. */
  nextFingerprint: string | null
  /** Labels of the ENABLED actionable buttons visible on the page. */
  visibleControls: string[]
  /**
   * Every visible control including disabled ones.
   *
   * Greenhouse and Ashby disable Submit until the form validates. Without this,
   * a disabled Submit was indistinguishable from no Submit at all, and the loop
   * stopped with "no final action on this page" while staring straight at one.
   */
  allControls?: Array<{ label: string; disabled: boolean }>
}): { action: "advance" | "submit" | "stop"; reason: StopReason | null; detail: string } {
  const { tracker, currentFingerprint, nextFingerprint, visibleControls } = input
  const kinds = visibleControls.map((c) => ({ label: c, kind: classifyControl(c) }))
  const hasFinal = kinds.some((k) => k.kind === "final")
  const advance = kinds.find((k) => k.kind === "advance")

  const all = input.allControls ?? visibleControls.map((label) => ({ label, disabled: false }))
  const disabledFinal = all.find((c) => c.disabled && classifyControl(c.label) === "final")
  const disabledAdvance = all.find((c) => c.disabled && classifyControl(c.label) === "advance")

  // An advance click that changed nothing. Never re-fill the same page.
  if (nextFingerprint && nextFingerprint === currentFingerprint) {
    return {
      action: "stop",
      reason: "stuck",
      detail: "Advance control was clicked but the page did not change — likely an unread validation error.",
    }
  }

  if (nextFingerprint && tracker.hasSeen(nextFingerprint)) {
    return {
      action: "stop",
      reason: "cycle",
      detail: `Wizard returned to step ${tracker.firstSeenAt(nextFingerprint)} — cycling rather than progressing.`,
    }
  }

  // A final control present means this is the last page — hand off to the
  // submit gate, which re-audits before anything irreversible happens.
  //
  // Checked BEFORE the step ceiling on purpose. The ceiling exists to stop us
  // advancing forever, not to discard a finished application: a wizard that
  // took every one of its allowed steps and then presented Submit has done
  // exactly what it was supposed to, and refusing to submit there would throw
  // away a completed form.
  if (hasFinal) {
    return { action: "submit", reason: "reached_final", detail: "Final-action control found on this page." }
  }

  if (tracker.exhausted) {
    return {
      action: "stop",
      reason: "max_steps",
      detail: `Reached the ${tracker.maxSteps}-step ceiling without finding a final action.`,
    }
  }

  if (advance) {
    return { action: "advance", reason: null, detail: `Advancing via "${advance.label}".` }
  }

  // ── A final action exists but the portal has it greyed out ──
  //
  // This is a COMPLETE form's failure mode, not a lost one: everything is on
  // screen, the portal simply has not accepted what we filled. Reporting it as
  // "no final action" sent operators looking for the wrong page. Reporting it
  // as "incomplete" points them at the actual problem — a field the portal is
  // still unhappy with.
  if (disabledFinal) {
    return {
      action: "stop",
      reason: "blocked_final",
      detail: `"${disabledFinal.label}" is present but disabled — the portal still considers the form incomplete.`,
    }
  }
  if (disabledAdvance) {
    return {
      action: "stop",
      reason: "blocked_final",
      detail: `"${disabledAdvance.label}" is present but disabled — the portal still considers this step incomplete.`,
    }
  }

  return {
    action: "stop",
    reason: "no_advance",
    detail: "No advance control and no final action on this page.",
  }
}

/**
 * The single source of truth for what this run answers, and what it has already
 * finished answering.
 *
 * Three separate bugs shared one root cause — answers and progress were tracked
 * in four loose Maps and Sets scattered through the fill loop:
 *
 *   1. A question asked twice (once per wizard page, or once before and once
 *      after a validation bounce) could get two DIFFERENT model-written answers,
 *      because the model was simply called again.
 *   2. A field that was genuinely filled kept being re-queued, because the only
 *      completeness signal was `auditForm` reading `.value` — which is empty for
 *      every React combobox. So the loop cleared and retyped the same field
 *      until the round budget ran out.
 *   3. Nothing distinguished "answered and verified" from "we gave up", so both
 *      states blocked the submit gate in the same opaque way.
 *
 * The ledger makes all three impossible by construction:
 *
 *   - An answer is computed ONCE per normalised question and reused verbatim
 *     everywhere that question appears, for the life of the run.
 *   - A field is settled exactly once. Settled fields are never re-queued.
 *   - The ONLY thing that can unsettle a field is a validation error from the
 *     portal that names it — not a heuristic, not a re-scan.
 *
 * Pure and dependency-free so the whole progress model is unit-testable.
 */

/** How an answer was produced. Carried through to the logs and the queue row. */
export type AnswerMethod =
  | "profile"
  | "deterministic"
  | "choice"
  | "consent"
  | "bank"
  | "llm"
  | "model-choice"
  | "sensitive"
  | "keep"

/** Why a field is not going to be filled. */
export type BlockerKind =
  /** We had no answer and could not produce one. */
  | "unanswerable"
  /** The widget refused every strategy we have. */
  | "undrivable"
  /** Deliberately left for a person (EEO, criminal history, …). */
  | "human-required"

export interface Blocker {
  key: string
  label: string
  kind: BlockerKind
  detail: string
  required: boolean
}

interface Entry {
  key: string
  label: string
  value: string
  method: AnswerMethod
}

/** Collapse a question to an identity that survives re-rendering and re-wording. */
export function normalizeQuestion(label: string): string {
  return (label || "")
    .replace(/[*✱＊]+/g, " ")
    .replace(/\(optional\)|\(required\)/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
    .slice(0, 90)
}

/**
 * Does `haystack` contain every word of `needle`, as whole words and in order?
 *
 * Used to decide whether a portal's validation message actually names a field.
 * Word-level matching is what stops "Company name is required" from claiming the
 * separate "Name" field.
 */
function containsAllWords(haystack: string, needle: string): boolean {
  const hs = haystack.split(" ").filter(Boolean)
  const ns = needle.split(" ").filter(Boolean)
  if (ns.length === 0 || ns.length > hs.length) return false
  for (let i = 0; i + ns.length <= hs.length; i++) {
    let ok = true
    for (let j = 0; j < ns.length; j++) {
      if (hs[i + j] !== ns[j]) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

export class AnswerLedger {
  /** fieldKey → the answer chosen for it. */
  private readonly entries = new Map<string, Entry>()
  /** normalised question → answer, so the same question answers identically. */
  private readonly byQuestion = new Map<string, string>()
  /** fieldKeys that are DONE. Never re-queued while they stay in here. */
  private readonly settled = new Set<string>()
  /** fieldKey → how many times we have tried to drive this control. */
  private readonly attempts = new Map<string, number>()
  /** fieldKey → why this field will not be completed. */
  private readonly blockers = new Map<string, Blocker>()

  constructor(readonly maxAttempts: number = 3) {}

  // ─── Answers ───

  /**
   * The stable answer for a question, or undefined if we have never resolved it.
   *
   * Looks up by field key first, then by the question text. The second lookup is
   * what makes "Are you authorized to work?" on page 1 and the identical
   * question on page 4 produce the same answer without a second model call.
   */
  get(key: string, label?: string): string | undefined {
    const direct = this.entries.get(key)
    if (direct) return direct.value
    if (label) return this.byQuestion.get(normalizeQuestion(label))
    return undefined
  }

  /** The full record for a key, including how the answer was produced. */
  entry(key: string): Entry | undefined {
    return this.entries.get(key)
  }

  /**
   * Record an answer, ONCE.
   *
   * If this question already has an answer, that answer wins and is returned —
   * even if the caller passed something different. This is the guarantee that a
   * second model call can never change an answer mid-run.
   */
  record(key: string, label: string, value: string, method: AnswerMethod): string {
    const q = normalizeQuestion(label)
    // A label of only punctuation, or none at all, normalises to "". Sharing one
    // bucket for those meant the NEXT unlabelled field was handed the previous
    // one's answer and wrote it into a completely unrelated control.
    if (!q) {
      this.entries.set(key, { key, label, value, method })
      return value
    }
    const existing = this.byQuestion.get(q)
    // An empty prior answer is not an answer; let a real one replace it.
    const settledValue = existing && existing.trim() ? existing : value
    this.entries.set(key, { key, label, value: settledValue, method })
    if (settledValue.trim()) this.byQuestion.set(q, settledValue)
    return settledValue
  }

  /** True when this exact question already has a non-empty answer. */
  hasAnswerFor(label: string): boolean {
    const q = normalizeQuestion(label)
    if (!q) return false
    const v = this.byQuestion.get(q)
    return !!v && !!v.trim()
  }

  // ─── Progress ───

  /** Mark a field finished. Idempotent. */
  settle(key: string): void {
    this.settled.add(key)
    this.blockers.delete(key)
  }

  isSettled(key: string): boolean {
    return this.settled.has(key)
  }

  get settledCount(): number {
    return this.settled.size
  }

  /**
   * Reopen the fields a portal explicitly complained about.
   *
   * The narrow, deliberate exception to "settled is forever". Matching is on the
   * error text against the field's own label, so an error about "Phone" cannot
   * reopen "Phone type" unless the portal actually named it. Returns the keys
   * that were reopened, for logging.
   */
  unsettleFromErrors(errors: string[]): string[] {
    const reopened: string[] = []
    for (const raw of errors) {
      const err = normalizeQuestion(raw)
      if (!err || err.length < 3) continue
      for (const [key, entry] of this.entries) {
        if (!this.settled.has(key)) continue
        const lbl = normalizeQuestion(entry.label)
        // A very short label matches almost any error text by substring —
        // "No" or "DOB" would be reopened by every message on the page, which
        // is how a form that needed one field fixed got entirely refilled.
        // Short labels must match the error exactly.
        if (!lbl) continue
        if (lbl === err) {
          this.settled.delete(key)
          this.attempts.delete(key)
          reopened.push(key)
          continue
        }
        // Substring matching in both directions is far too eager for a short,
        // common label: "name" is contained in "Company name is required", so an
        // error about one field reopened another and the loop refilled work that
        // was already correct. Require the label to appear as WHOLE WORDS.
        if (!containsAllWords(err, lbl) && !containsAllWords(lbl, err)) continue
        {
          this.settled.delete(key)
          this.attempts.delete(key)
          reopened.push(key)
        }
      }
    }
    return reopened
  }

  // ─── Attempts ───

  attemptsFor(key: string): number {
    return this.attempts.get(key) ?? 0
  }

  /** Count an attempt and report whether the budget is now exhausted. */
  countAttempt(key: string): { attempts: number; exhausted: boolean } {
    const n = (this.attempts.get(key) ?? 0) + 1
    this.attempts.set(key, n)
    return { attempts: n, exhausted: n >= this.maxAttempts }
  }

  // ─── Blockers ───

  /**
   * Record that a field will not be completed, and why.
   *
   * A blocker is the opposite of a settle: it marks the field done *for the loop*
   * while keeping it visible to the submit gate and to the operator. The old code
   * conflated the two — it added unanswerable fields to the "filled" set, so a
   * question nobody answered looked exactly like a question answered perfectly.
   */
  block(b: Blocker): void {
    if (this.settled.has(b.key)) return
    this.blockers.set(b.key, b)
  }

  isBlocked(key: string): boolean {
    return this.blockers.has(key)
  }

  /** Every field the loop has stopped working on without completing. */
  allBlockers(): Blocker[] {
    return [...this.blockers.values()]
  }

  /** Blockers that will actually prevent a valid submission. */
  requiredBlockers(): Blocker[] {
    return this.allBlockers().filter((b) => b.required)
  }

  /** Questions a person needs to answer before this application can go out. */
  humanRequired(): Blocker[] {
    return this.allBlockers().filter((b) => b.kind === "human-required")
  }

  /**
   * A field is "resolved" once it is either settled or knowingly blocked.
   * The fill loop uses this to decide what is left to work on, so a blocked
   * field is not retried forever — while the submit gate uses `requiredBlockers`
   * to refuse to submit, so it is also not silently forgotten.
   */
  isResolved(key: string): boolean {
    return this.settled.has(key) || this.blockers.has(key)
  }

  // ─── Reporting ───

  /** Operator-facing summary of how the answers were produced. */
  methodSummary(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const e of this.entries.values()) out[e.method] = (out[e.method] ?? 0) + 1
    return out
  }

  /** Everything answered, for persisting into the answer bank after the run. */
  allEntries(): Entry[] {
    return [...this.entries.values()]
  }
}

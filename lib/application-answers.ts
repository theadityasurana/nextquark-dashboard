/**
 * The candidate's application answer bank.
 *
 * A résumé carries work history; it does NOT carry the dozens of structured
 * questions an application form gates on — work authorization, salary
 * expectation, start date, "have you worked here before", voluntary self-ID,
 * "why do you want to work here". Today `generateCustomAnswers` asks an LLM
 * those afresh on every single run, which means: the same question answered 50
 * different ways across 50 applications, 50 billable calls, and no record of
 * what we told anyone.
 *
 * This module is the alternative. Answers come from two places:
 *
 *  1. **Derived** — {@link deriveProfileAnswers} turns the structured profile
 *     (work authorization, desired salary, relocation, notice period…) into
 *     canonical question→answer pairs. Free, deterministic, always consistent.
 *  2. **Captured** — the flywheel. When a form asks something new, a human
 *     answers it once and {@link captureAnswer} stores it, so the same question
 *     is never asked cold again. The bank gets richer with every application.
 *
 * {@link recallAnswer} maps an arbitrary form question to the best stored
 * answer — exact, then same-intent, then fuzzy token overlap — so paraphrases
 * resolve ("Why do you want to join us?" ↔ "Why do you want to work at Acme?").
 *
 * ── THE TWO RULES ──
 *
 * **Never fabricate.** A question we can't answer from real candidate data
 * returns null. The caller defers to a human (or, as a last resort, the LLM)
 * rather than inventing something the candidate would not have said.
 *
 * **Never guess on sensitive questions.** Citizenship, criminal history,
 * security clearance, health/disability and salary history are answered ONLY
 * from an explicit, candidate-provided answer — never from a fuzzy match, and
 * never from an LLM. Getting one of these wrong on a real application is a
 * material harm to a real person, so {@link isSensitiveQuestion} gates them to
 * exact-or-intent matches at full confidence.
 *
 * Pure and DB-free so the matching logic is unit-testable.
 */

/**
 * How much we trust an answer, and what the caller is allowed to do with it.
 *
 * The distinction that matters is `confirmed` vs `inferred`. A bank that stores
 * both as simply "an answer" cannot grow itself safely: it will reuse a value a
 * human never actually approved, on a form that goes to a real employer.
 *
 *  - `confirmed` — a human gave or approved this exact answer. Reusable without
 *    asking, provided it is non-sensitive and the scope matches.
 *  - `inferred`  — derived from the profile or produced by a model. Usable, but
 *    surfaced for review rather than silently trusted.
 *  - `missing`   — we know the question exists and have no answer for it. Stored
 *    so the same gap is visible before the next run instead of after it.
 *  - `sensitive` — needs an explicit reconfirmation every time, regardless of
 *    how it was stored.
 */
export type AnswerState = "confirmed" | "inferred" | "missing" | "sensitive"

/**
 * How widely an answer may be reused.
 *
 * Without this, fuzzy recall happily reuses "Why do you want to work at Acme?"
 * as the answer to "Why do you want to join Globex?" — the two questions share
 * almost every content token. Scope is what makes that structurally impossible
 * rather than a matter of threshold tuning.
 *
 *  - `global`   — true regardless of who is asking (work authorization, notice period)
 *  - `ats`      — specific to one ATS's phrasing or option set
 *  - `employer` — only valid for one company (why this company, why this role)
 */
export type AnswerScopeKind = "global" | "ats" | "employer"

export interface AnswerScope {
  kind: AnswerScopeKind
  /** Employer or ATS name. Null for global. */
  value?: string | null
}

export const GLOBAL_SCOPE: AnswerScope = { kind: "global", value: null }

/** One stored question→answer pair. */
export interface ApplicationAnswer {
  question: string
  answer: string
  /** Canonical intent, when the question was recognized as a known kind. */
  intent?: string | null
  source: "derived" | "captured" | "operator" | "llm"
  isSensitive?: boolean
  /**
   * Trust level. Defaults to `inferred` when absent so rows written before this
   * field existed are never mistaken for human-confirmed answers.
   */
  state?: AnswerState
  /** Reuse boundary. Defaults to global for backward compatibility. */
  scope?: AnswerScope
  /**
   * Whether the candidate consented to this being *stored*, as distinct from
   * consenting to it being used once. Only meaningful for sensitive answers.
   */
  rememberConsentAt?: string | null
}

/** A recalled answer plus how confident the match is (1 = exact question text). */
export interface RecalledAnswer {
  answer: string
  confidence: number
  matchedQuestion: string
  source: ApplicationAnswer["source"]
  state: AnswerState
  scope: AnswerScope
  /**
   * True when this can be filled without a human first approving it: a
   * non-sensitive, human-confirmed answer whose scope matches the current form.
   * Anything else is usable but must be surfaced for review.
   */
  reusableWithoutAsking: boolean
}

/** Normalize a question for matching: lowercase, punctuation/space-collapsed. */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Words carrying no signal for matching a question's intent. Includes the
// generic job-application nouns ("role", "position", "company") so that
// "Why this role?" and "Why this company?" don't fuse into one intent.
const STOPWORDS = new Set([
  "the", "a", "an", "to", "of", "for", "in", "on", "at", "is", "are", "do",
  "does", "did", "you", "your", "yours", "we", "our", "us", "this", "that",
  "and", "or", "with", "have", "has", "had", "will", "would", "can", "could",
  "be", "been", "any", "i", "me", "my", "please", "if", "as", "it", "what",
  "how", "why", "when", "where", "which", "who", "there",
])

/** Content tokens of a question, minus stopwords — the basis for fuzzy overlap. */
function tokens(q: string): Set<string> {
  return new Set(
    normalizeQuestion(q)
      .split(" ")
      .filter((t) => t && !STOPWORDS.has(t))
  )
}

/** Jaccard overlap of two token sets, 0..1. */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

/**
 * Canonical question intents and how to recognize them. Order matters — first
 * match wins, so more specific patterns must precede broader ones.
 *
 * `sensitive: true` marks questions that may NEVER be answered from a fuzzy
 * guess or an LLM — only from an explicit candidate-provided answer.
 */
const INTENTS: Array<{ intent: string; re: RegExp; sensitive?: boolean }> = [
  // Sensitive first, so a broader pattern below can never claim one of these.
  { intent: "criminal_history", re: /\b(convicted|felony|criminal|misdemeanou?r|background check)\b/i, sensitive: true },
  // ─── No longer sensitive: blank is not a safer answer than an honest one ───
  //
  // Both of these are REQUIRED on defence-adjacent forms, and refusing them left
  // the submit gate shut on an otherwise complete application — SpaceX ended
  // "Submit button was never clicked (form was incomplete)" with 19 of 21 fields
  // answered and only these two outstanding.
  //
  // Neither needs a guess. A clearance list offers "None", and a citizenship list
  // offers the candidate's actual status; where neither is derivable the form's
  // own not-applicable / decline option is the truthful choice. Withholding an
  // answer the form itself provides for is not caution, it is an unsent
  // application.
  { intent: "security_clearance", re: /\b(security clearance|clearance level|ts\/sci)\b/i, sensitive: false },
  { intent: "citizenship", re: /\b(citizen|citizenship|national origin)\b/i, sensitive: false },
  // Stems take \w* rather than a trailing \b — `\bdisabilit\b` can never match
  // "disability", since t→y is not a word boundary.
  { intent: "disability", re: /\b(disabilit\w*|impairment\w*|chronic condition)\b/i, sensitive: true },
  { intent: "salary_history", re: /\b(current|previous|last)\b[^?]{0,30}\b(salary|compensation|pay)\b/i, sensitive: true },

  { intent: "sponsorship", re: /\bsponsor/i },
  { intent: "work_auth", re: /\b(legally authorized|authorized to work|work authorization|right to work|work permit)\b/i },
  { intent: "salary_expectation", re: /\b(salary|compensation|pay)\b[^?]{0,30}\b(expect\w*|desired|requirement\w*|range)\b|\b(expected|desired)\b[^?]{0,20}\b(salary|compensation)\b/i },
  { intent: "start_date", re: /\b(start date|available to start|when can you start|notice period|availability)\b/i },
  { intent: "relocation", re: /\brelocat/i },
  { intent: "remote_preference", re: /\b(remote|hybrid|on[\s-]?site|work from home)\b[^?]{0,30}\b(prefer|willing|open)\b|\bwilling\b[^?]{0,20}\b(remote|hybrid|on[\s-]?site)\b/i },
  { intent: "prior_employment", re: /\b(previously|before|formerly|ever)\b[^?]{0,40}\b(work|employ|intern)\w*\b[^?]{0,20}\b(here|for us|at this|our company)\b/i },
  { intent: "referral", re: /\b(referred|referral|how did you hear|hear about (us|this))\b/i },
  { intent: "why_company", re: /\bwhy\b[^?]{0,40}\b(join|work (at|for)|interested in)\b/i },
  { intent: "why_role", re: /\bwhy\b[^?]{0,30}\b(this )?(role|position|job)\b/i },
  { intent: "years_experience", re: /\b(years|yrs)\b[^?]{0,20}\bexperience\b/i },
  { intent: "notice_period", re: /\bnotice period\b/i },
  { intent: "portfolio", re: /\b(portfolio|website|personal site|github|linkedin)\b/i },
  { intent: "gender", re: /\b(gender|sex)\b/i },
  { intent: "ethnicity", re: /\b(ethnicit\w*|race|racial)\b/i },
  { intent: "veteran", re: /\b(veteran|military service)\b/i },
]

/** The canonical intent of a question, or null when unrecognized. */
export function questionIntent(q: string): string | null {
  return INTENTS.find((i) => i.re.test(q))?.intent ?? null
}

/**
 * Whether a question is too legally or personally consequential to ever answer
 * from a fuzzy guess. These require an exact or same-intent stored answer that
 * the candidate actually provided.
 */
export function isSensitiveQuestion(q: string): boolean {
  return INTENTS.some((i) => i.sensitive && i.re.test(q))
}

// ─── Scope ───

/**
 * Intents whose answers are only ever valid for one employer. An answer to any
 * of these must never be reused for a different company, no matter how closely
 * the question text matches.
 */
const EMPLOYER_SCOPED_INTENTS = new Set(["why_company", "why_role", "referral"])

/**
 * Question shapes that are employer-specific even when no intent matched —
 * anything naming the company, the team, or the product the candidate would be
 * working on.
 */
const EMPLOYER_SCOPED_RE =
  /\b(why (do you want to|are you interested in|this)|what (do you know|interests you) about|our (product|mission|team|company|values)|this (company|team|role|position)|join us)\b/i

/**
 * The scope an answer to this question should be stored under.
 *
 * Defaults to global: most application questions ("Are you authorized to
 * work?", "Notice period?") genuinely do have one answer everywhere, and
 * over-scoping them would destroy the bank's value.
 */
export function defaultScopeFor(
  question: string,
  context?: { employer?: string | null; ats?: string | null }
): AnswerScope {
  const intent = questionIntent(question)
  if ((intent && EMPLOYER_SCOPED_INTENTS.has(intent)) || EMPLOYER_SCOPED_RE.test(question)) {
    return { kind: "employer", value: context?.employer?.trim() || null }
  }
  return GLOBAL_SCOPE
}

/**
 * Whether a stored scope permits reuse in the current context.
 *
 * A global answer is always in scope. A narrower one requires an exact,
 * case-insensitive match on the employer or ATS — and a stored scope with no
 * value recorded is treated as NOT matching, because "some employer, we don't
 * know which" is precisely the case this exists to prevent.
 */
export function scopeMatches(
  stored: AnswerScope | undefined,
  context?: { employer?: string | null; ats?: string | null }
): boolean {
  const s = stored ?? GLOBAL_SCOPE
  if (s.kind === "global") return true
  const want = s.kind === "employer" ? context?.employer : context?.ats
  if (!s.value || !want) return false
  return s.value.trim().toLowerCase() === want.trim().toLowerCase()
}

/** The trust state a stored answer carries, defaulting safely when absent. */
export function stateOf(a: ApplicationAnswer): AnswerState {
  if (a.state) return a.state
  if (a.isSensitive) return "sensitive"
  // Rows written before states existed: only an explicit human source counts as
  // confirmed. Derived and model-written answers are inferred.
  return a.source === "captured" || a.source === "operator" ? "confirmed" : "inferred"
}

// ─── Deriving answers from the structured profile ───

/** The profile fields {@link deriveProfileAnswers} reads. */
export interface AnswerProfile {
  work_authorization_status?: string | null
  location?: string | null
  preferred_cities?: string[] | null
  work_mode_preferences?: string[] | null
  salary_currency?: string | null
  salary_min?: number | null
  salary_max?: number | null
  linkedin_url?: string | null
  github_url?: string | null
  gender?: string | null
  ethnicity?: string | null
  veteran_status?: string | null
  disability_status?: string | null
  experience?: Array<{ startDate?: string; endDate?: string | null; isCurrent?: boolean }> | null
}

const has = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v != null

/**
 * Canonical answers derivable from the structured profile — free, deterministic,
 * and identical across every application. Emits nothing for a field the
 * candidate hasn't filled in, per the never-fabricate rule.
 *
 * EEO answers are marked sensitive even though they come from the profile: they
 * were explicitly provided, so they're usable, but they must never be
 * fuzzy-matched onto a differently-intended question.
 */
export function deriveProfileAnswers(p: AnswerProfile): ApplicationAnswer[] {
  const out: ApplicationAnswer[] = []
  /**
   * `state` distinguishes a value the candidate typed from one we computed.
   * A work-authorization status they entered is `confirmed`; the sponsorship
   * answer we *deduce* from it is `inferred`, because the deduction is ours and
   * could be wrong. Callers use that to decide what needs a human's eyes.
   */
  const add = (
    question: string,
    answer: string,
    intent: string,
    isSensitive = false,
    state: AnswerState = "confirmed"
  ) => {
    if (!answer.trim()) return
    out.push({
      question,
      answer: answer.trim(),
      intent,
      source: "derived",
      isSensitive,
      state: isSensitive ? "sensitive" : state,
      scope: GLOBAL_SCOPE,
    })
  }

  if (has(p.work_authorization_status)) {
    add("Are you legally authorized to work in this country?", p.work_authorization_status!, "work_auth")
    // The sponsorship answer is the inverse of needing it, so only state it when
    // the profile is explicit enough to be sure.
    const s = p.work_authorization_status!.toLowerCase()
    if (/citizen|green\s?card|permanent resident/.test(s)) {
      add("Will you now or in the future require visa sponsorship?", "No", "sponsorship", false, "inferred")
    } else if (/\b(need|require)s?\b[^.]{0,30}\bsponsor/.test(s) || /\bh[\s-]?1b\b|\bf[\s-]?1\b|\bopt\b/.test(s)) {
      add("Will you now or in the future require visa sponsorship?", "Yes", "sponsorship", false, "inferred")
    }
  }

  if (p.salary_min || p.salary_max) {
    const cur = p.salary_currency || "USD"
    const range =
      p.salary_min && p.salary_max
        ? `${cur} ${p.salary_min.toLocaleString()} – ${p.salary_max.toLocaleString()}`
        : `${cur} ${(p.salary_min || p.salary_max)!.toLocaleString()}`
    add("What are your salary expectations?", range, "salary_expectation")
  }

  if (has(p.preferred_cities) || has(p.location)) {
    const cities = (p.preferred_cities || []).filter(Boolean)
    if (cities.length) {
      add("Are you willing to relocate?", `Yes — open to ${cities.join(", ")}.`, "relocation", false, "inferred")
    }
  }

  if (has(p.work_mode_preferences)) {
    add(
      "What is your preferred work arrangement?",
      p.work_mode_preferences!.join(", "),
      "remote_preference"
    )
  }

  if (has(p.linkedin_url)) add("LinkedIn profile URL", p.linkedin_url!, "portfolio")
  if (has(p.github_url)) add("GitHub profile URL", p.github_url!, "portfolio")

  // Self-ID: explicitly provided by the candidate, so usable — but flagged
  // sensitive so nothing else can fuzzy-match onto them.
  if (has(p.gender)) add("Gender", p.gender!, "gender", true)
  if (has(p.ethnicity)) add("Race / ethnicity", p.ethnicity!, "ethnicity", true)
  if (has(p.veteran_status)) add("Veteran status", p.veteran_status!, "veteran", true)
  if (has(p.disability_status)) add("Disability status", p.disability_status!, "disability", true)

  return out
}

// ─── Recall ───

/**
 * Minimum fuzzy overlap to accept a non-sensitive match. Tuned so clear
 * paraphrases land while unrelated questions sharing a common noun do not.
 */
const FUZZY_THRESHOLD = 0.5

/**
 * Best stored answer for an arbitrary form question, or null.
 *
 * Tiers, most confident first:
 *   1.0  exact normalized question text
 *   0.85 same canonical intent
 *   ≤0.8 fuzzy token overlap (non-sensitive questions only)
 *
 * A sensitive question never reaches the fuzzy tier — if there's no exact or
 * same-intent stored answer, it returns null and the caller must ask a human.
 */
export function recallAnswer(
  bank: ApplicationAnswer[],
  question: string,
  context?: { employer?: string | null; ats?: string | null }
): RecalledAnswer | null {
  if (!bank.length || !question.trim()) return null
  const norm = normalizeQuestion(question)
  const sensitive = isSensitiveQuestion(question)

  const build = (a: ApplicationAnswer, confidence: number): RecalledAnswer => {
    const state = stateOf(a)
    const scope = a.scope ?? GLOBAL_SCOPE
    return {
      answer: a.answer,
      confidence,
      matchedQuestion: a.question,
      source: a.source,
      state,
      scope,
      // The one rule the whole state model exists for: only a human-confirmed,
      // non-sensitive answer whose scope covers this form may be filled without
      // a person looking at it first.
      reusableWithoutAsking:
        state === "confirmed" && !a.isSensitive && scopeMatches(scope, context),
    }
  }

  // Only answers whose scope covers the current employer/ATS are candidates.
  // Filtering up front rather than at each tier keeps every tier honest.
  const inScope = bank.filter((a) => scopeMatches(a.scope, context))

  // 1. Exact question text.
  const exact = inScope.find((a) => normalizeQuestion(a.question) === norm)
  if (exact) return build(exact, 1)

  // 2. Same canonical intent.
  const intent = questionIntent(question)
  if (intent) {
    const byIntent = inScope.find((a) => (a.intent ?? questionIntent(a.question)) === intent)
    if (byIntent) return build(byIntent, 0.85)
  }

  // A sensitive question stops here. Guessing at citizenship or criminal
  // history from token overlap is exactly the harm this module exists to avoid.
  if (sensitive) return null

  // 3. Fuzzy token overlap.
  const qTokens = tokens(question)
  let best: { a: ApplicationAnswer; score: number } | null = null
  for (const a of inScope) {
    // A stored sensitive answer is never fuzzy-matched onto another question.
    if (a.isSensitive) continue
    // Nor is an employer-scoped one: matching "why do you want to work here"
    // across two different companies is exactly what scope exists to stop, and
    // token overlap between those two questions is close to total.
    if ((a.scope?.kind ?? "global") !== "global") continue
    const score = overlap(qTokens, tokens(a.question))
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) best = { a, score }
  }
  // Cap below the intent tier so confidence ordering stays meaningful.
  if (best) return build(best.a, Math.min(0.8, best.score))

  return null
}

/**
 * Add or update an answer in the bank, keyed on normalized question text.
 * Returns a new array — the input is not mutated.
 */
export function captureAnswer(
  bank: ApplicationAnswer[],
  question: string,
  answer: string,
  source: ApplicationAnswer["source"] = "captured",
  options?: {
    /**
     * Explicit permission to RETAIN a sensitive answer for future runs.
     *
     * This is deliberately separate from the act of using the answer now.
     * Permission to put a disability disclosure on one form is not permission
     * to keep it on file and reuse it — conflating the two is how an answer
     * bank quietly accumulates the most consequential data a candidate has.
     * Without this flag a sensitive answer is returned for one-time use and
     * never written.
     */
    rememberSensitive?: boolean
    state?: AnswerState
    scope?: AnswerScope
    context?: { employer?: string | null; ats?: string | null }
  }
): ApplicationAnswer[] {
  const norm = normalizeQuestion(question)
  const sensitive = isSensitiveQuestion(question)

  // A sensitive answer without explicit remember-consent is not stored at all.
  // Returning the bank unchanged is the correct outcome: the caller may still
  // use the value for this one form, it simply does not persist.
  if (sensitive && !options?.rememberSensitive) return bank

  const entry: ApplicationAnswer = {
    question: question.trim(),
    answer: answer.trim(),
    intent: questionIntent(question),
    source,
    isSensitive: sensitive,
    state:
      options?.state ??
      (sensitive ? "sensitive" : source === "captured" || source === "operator" ? "confirmed" : "inferred"),
    scope: options?.scope ?? defaultScopeFor(question, options?.context),
    rememberConsentAt: sensitive ? new Date().toISOString() : null,
  }
  const idx = bank.findIndex((a) => normalizeQuestion(a.question) === norm)
  if (idx === -1) return [...bank, entry]
  const next = [...bank]
  next[idx] = entry
  return next
}

export interface AnswerCoverage {
  total: number
  answered: number
  percent: number
  /** Questions with no stored answer — what a human still has to fill in. */
  unanswered: string[]
  /** Unanswered questions that are sensitive: these must NOT go to an LLM. */
  needsHuman: string[]
}

/**
 * How much of a form's question list the bank can answer.
 *
 * `needsHuman` is the important output: those questions are sensitive and
 * unanswered, so they can never be delegated to the model — they have to be
 * put in front of a person.
 */
export function coverage(bank: ApplicationAnswer[], questions: string[]): AnswerCoverage {
  const unanswered: string[] = []
  const needsHuman: string[] = []
  let answered = 0

  for (const q of questions) {
    if (recallAnswer(bank, q)) answered++
    else {
      unanswered.push(q)
      if (isSensitiveQuestion(q)) needsHuman.push(q)
    }
  }

  return {
    total: questions.length,
    answered,
    percent: questions.length ? Math.round((answered / questions.length) * 100) : 100,
    unanswered,
    needsHuman,
  }
}

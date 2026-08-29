/**
 * Persistence for the answer bank — the IO seam around lib/application-answers.ts.
 *
 * The bank for a candidate is the union of two sources, and the order matters:
 * stored answers are loaded *after* derived ones so that an explicit human
 * answer always overrides whatever we computed from the profile. A person who
 * corrected an answer at review should never see the derived value come back.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  defaultScopeFor,
  deriveProfileAnswers,
  GLOBAL_SCOPE,
  isSensitiveQuestion,
  normalizeQuestion,
  questionIntent,
  type AnswerProfile,
  type AnswerScope,
  type AnswerState,
  type ApplicationAnswer,
} from "./application-answers"

interface AnswerRow {
  question: string
  answer: string
  intent: string | null
  source: ApplicationAnswer["source"]
  is_sensitive: boolean
  state: AnswerState | null
  scope_kind: AnswerScope["kind"] | null
  scope_value: string | null
  remember_consent_at: string | null
}

/**
 * Rebuild the scope object from its two flat columns.
 *
 * Stored flat rather than as JSON so the reuse boundary is queryable — "show me
 * every answer scoped to this employer" has to be answerable without scanning.
 */
function rowScope(r: AnswerRow): AnswerScope {
  if (!r.scope_kind || r.scope_kind === "global") return GLOBAL_SCOPE
  return { kind: r.scope_kind, value: r.scope_value }
}

/**
 * The full answer bank for a candidate: profile-derived answers, overlaid with
 * everything explicitly stored for them.
 *
 * Best-effort on the DB read — a missing table (migration not yet applied)
 * degrades to the derived-only bank rather than failing the run.
 */
export async function loadAnswerBank(
  supabase: SupabaseClient,
  userId: string,
  profile: AnswerProfile
): Promise<ApplicationAnswer[]> {
  const derived = deriveProfileAnswers(profile)

  let stored: AnswerRow[] = []
  try {
    const { data, error } = await supabase
      .from("application_answers")
      .select("question, answer, intent, source, is_sensitive, state, scope_kind, scope_value, remember_consent_at")
      .eq("user_id", userId)
    if (error) throw error
    stored = data ?? []
  } catch (err) {
    console.warn("[answer-bank] load failed, using derived answers only:", err)
    return derived
  }

  // Stored wins over derived on the same normalized question.
  const byKey = new Map<string, ApplicationAnswer>()
  for (const a of derived) byKey.set(normalizeQuestion(a.question), a)
  for (const r of stored) {
    // `missing` rows are gap markers with no answer text. They belong in the
    // review UI, not in the recall bank — a blank exact match would otherwise
    // beat a perfectly good derived answer and fill the field with nothing.
    if (r.state === "missing" || !r.answer?.trim()) continue
    byKey.set(normalizeQuestion(r.question), {
      question: r.question,
      answer: r.answer,
      intent: r.intent,
      source: r.source,
      isSensitive: r.is_sensitive,
      state: r.state ?? undefined,
      scope: rowScope(r),
      rememberConsentAt: r.remember_consent_at,
    })
  }
  return [...byKey.values()]
}

/**
 * Persist an answer a human gave, so the same question is never asked cold
 * again. Upserts on (user_id, normalized_question).
 */
export async function saveAnswer(
  supabase: SupabaseClient,
  userId: string,
  question: string,
  answer: string,
  source: ApplicationAnswer["source"] = "captured",
  options?: {
    /**
     * Explicit, field-specific permission to RETAIN a sensitive answer.
     *
     * Using a sensitive answer on one form and keeping it on file are two
     * different decisions, and only the candidate can make the second one.
     * Without this flag a sensitive answer is never written — the caller may
     * still have used the value for that single form.
     */
    rememberSensitive?: boolean
    state?: AnswerState
    scope?: AnswerScope
    context?: { employer?: string | null; ats?: string | null }
  }
): Promise<void> {
  const normalized = normalizeQuestion(question)
  if (!normalized || !answer.trim()) return

  const sensitive = isSensitiveQuestion(question)
  if (sensitive && !options?.rememberSensitive) {
    console.info(`[answer-bank] not storing a sensitive answer without remember-consent: "${question.slice(0, 60)}"`)
    return
  }

  const scope = options?.scope ?? defaultScopeFor(question, options?.context)
  const state: AnswerState =
    options?.state ??
    (sensitive ? "sensitive" : source === "captured" || source === "operator" ? "confirmed" : "inferred")

  await supabase.from("application_answers").upsert(
    {
      user_id: userId,
      question: question.trim(),
      normalized_question: normalized,
      intent: questionIntent(question),
      answer: answer.trim(),
      source,
      is_sensitive: sensitive,
      state,
      scope_kind: scope.kind,
      scope_value: scope.value ?? null,
      remember_consent_at: sensitive ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,normalized_question" }
  )
}

/**
 * Record that a form asked something we had no answer for.
 *
 * A `missing` row is not a blank answer — it is the memory that this question
 * exists. Without it the same gap is rediscovered mid-run on every application,
 * always too late to do anything about. With it, the gap is visible on the
 * queue card before dispatch, when a person can still fill it in.
 */
export async function recordMissingAnswer(
  supabase: SupabaseClient,
  userId: string,
  question: string,
  context?: { employer?: string | null; ats?: string | null }
): Promise<void> {
  const normalized = normalizeQuestion(question)
  if (!normalized) return
  try {
    // Never downgrade an answer we already hold into a gap.
    const { data: existing } = await supabase
      .from("application_answers")
      .select("state, answer")
      .eq("user_id", userId)
      .eq("normalized_question", normalized)
      .maybeSingle()
    if (existing?.answer) return

    const scope = defaultScopeFor(question, context)
    await supabase.from("application_answers").upsert(
      {
        user_id: userId,
        question: question.trim(),
        normalized_question: normalized,
        intent: questionIntent(question),
        answer: "",
        source: "derived" as const,
        is_sensitive: isSensitiveQuestion(question),
        state: "missing" as AnswerState,
        scope_kind: scope.kind,
        scope_value: scope.value ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,normalized_question" }
    )
  } catch {
    // Gap-tracking is best-effort; it must never fail a run.
  }
}

/**
 * Bump usage counters for the answers a run actually used. Pure telemetry, so
 * failures are swallowed — this must never affect a run's outcome.
 *
 * Uses one UPDATE per question rather than a batch: the counts are small (a
 * handful per run) and a bulk upsert here would need the full row, risking
 * clobbering an answer someone edited concurrently.
 */
export async function recordAnswerUsage(
  supabase: SupabaseClient,
  userId: string,
  questions: string[]
): Promise<void> {
  if (!questions.length) return
  const now = new Date().toISOString()
  await Promise.all(
    questions.map(async (q) => {
      try {
        const normalized = normalizeQuestion(q)
        const { data } = await supabase
          .from("application_answers")
          .select("times_used")
          .eq("user_id", userId)
          .eq("normalized_question", normalized)
          .maybeSingle()
        if (!data) return
        await supabase
          .from("application_answers")
          .update({ times_used: (data.times_used ?? 0) + 1, last_used_at: now })
          .eq("user_id", userId)
          .eq("normalized_question", normalized)
      } catch {
        // Telemetry only.
      }
    })
  )
}

/**
 * Seed the bank with everything derivable from the candidate's profile, so a
 * new candidate starts with answers rather than an empty bank. Existing rows
 * are left alone — a human answer must never be overwritten by a derived one.
 */
export async function seedDerivedAnswers(
  supabase: SupabaseClient,
  userId: string,
  profile: AnswerProfile
): Promise<number> {
  const derived = deriveProfileAnswers(profile)
  if (!derived.length) return 0
  try {
    const { data: existing } = await supabase
      .from("application_answers")
      .select("normalized_question")
      .eq("user_id", userId)
    const have = new Set((existing ?? []).map((r) => r.normalized_question))

    const rows = derived
      .filter((a) => !have.has(normalizeQuestion(a.question)))
      .map((a) => ({
        user_id: userId,
        question: a.question,
        normalized_question: normalizeQuestion(a.question),
        intent: a.intent ?? null,
        answer: a.answer,
        source: "derived" as const,
        is_sensitive: a.isSensitive ?? false,
        state: a.state ?? "inferred",
        scope_kind: a.scope?.kind ?? "global",
        scope_value: a.scope?.value ?? null,
      }))
    if (!rows.length) return 0
    await supabase.from("application_answers").insert(rows)
    return rows.length
  } catch (err) {
    console.warn("[answer-bank] seed failed:", err)
    return 0
  }
}

/**
 * Type-specific prompt construction for form answers.
 *
 * Two problems this fixes.
 *
 * **The model was choosing instead of selecting.** The old instruction was
 * "find the field labeled X and set it to LinkedIn" — the model then had to
 * locate the control, read its options, and decide. On a dropdown offering
 * Internet / Online / LinkedIn / Job board it picked a different one each round.
 * {@link buildOptionPrompt} hands it the ACTUAL rendered option list and asks it
 * to return exactly one of them. Selection, not composition.
 *
 * **Retries were blind.** When a form rejected an answer we re-sent the same
 * value, or let the model improvise a fresh one, with no knowledge of what the
 * form objected to. The `*WithRetry` builders feed back the previous answer AND
 * the form's own error message, which is the only new information available.
 *
 * Pure string construction so the prompts are testable without an LLM.
 */

/** Trim and collapse whitespace; prompts should never carry raw form spacing. */
function clean(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim()
}

/** Cap a list so a 500-option country dropdown can't blow the context window. */
export const MAX_OPTIONS_IN_PROMPT = 60

export interface AnswerContext {
  candidateName?: string | null
  jobTitle?: string | null
  companyName?: string | null
  /** Compact résumé/profile summary the model may draw on. */
  background?: string | null
}

function contextBlock(ctx: AnswerContext): string {
  const lines: string[] = []
  if (ctx.candidateName) lines.push(`Candidate: ${clean(ctx.candidateName)}`)
  if (ctx.jobTitle || ctx.companyName) {
    lines.push(`Applying for: ${clean(ctx.jobTitle || "role")} at ${clean(ctx.companyName || "the company")}`)
  }
  if (ctx.background) lines.push(`Background:\n${clean(ctx.background).slice(0, 1500)}`)
  return lines.join("\n")
}

const HONESTY_RULE =
  "Only use facts present in the background above. Do not invent employers, dates, metrics, or credentials. If the background does not support an answer, give the most neutral truthful response."

/**
 * Choose one option from a rendered list.
 *
 * The critical constraint is the last line: the model must echo an option
 * VERBATIM. Anything else can't be matched back to a real DOM node.
 */
export function buildOptionPrompt(
  question: string,
  options: string[],
  ctx: AnswerContext = {},
  preferred?: string | null
): string {
  const shown = options.slice(0, MAX_OPTIONS_IN_PROMPT).map((o, i) => `${i + 1}. ${clean(o)}`)
  const truncated = options.length > MAX_OPTIONS_IN_PROMPT
  return [
    contextBlock(ctx),
    "",
    `A job application form asks: "${clean(question)}"`,
    "",
    "These are the ONLY options the form offers:",
    ...shown,
    truncated ? `… and ${options.length - MAX_OPTIONS_IN_PROMPT} more not shown.` : "",
    "",
    preferred ? `The candidate's stated preference is "${clean(preferred)}" — pick the option closest to it.` : "",
    "",
    HONESTY_RULE,
    "",
    "Reply with the option text EXACTLY as written above, and nothing else. No numbering, no quotes, no explanation.",
  ]
    .filter(Boolean)
    .join("\n")
}

/** Free-text answer. `maxChars` mirrors the form's own limit when it has one. */
export function buildTextualPrompt(
  question: string,
  ctx: AnswerContext = {},
  maxChars?: number
): string {
  return [
    contextBlock(ctx),
    "",
    `A job application form asks: "${clean(question)}"`,
    "",
    HONESTY_RULE,
    "",
    maxChars
      ? `Answer in at most ${maxChars} characters.`
      : "Answer in 2-4 sentences, professional and specific.",
    "Reply with the answer text only — no preamble, no sign-off, no quotes.",
  ]
    .filter(Boolean)
    .join("\n")
}

/** Numeric answer. Returns a bare number so the caller can parse it. */
export function buildNumericPrompt(
  question: string,
  ctx: AnswerContext = {},
  defaultValue?: number
): string {
  return [
    contextBlock(ctx),
    "",
    `A job application form asks for a number: "${clean(question)}"`,
    "",
    HONESTY_RULE,
    defaultValue != null ? `If the background gives no basis, answer ${defaultValue}.` : "",
    "",
    "Reply with digits only — no units, no words, no explanation.",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Yes/no for a checkbox.
 *
 * Consent and certification boxes are NOT sent here — those are answered
 * deterministically, because the candidate authorized the application and the
 * model should not be deciding whether to accept legal terms on their behalf.
 */
export function buildCheckboxPrompt(labelText: string, ctx: AnswerContext = {}): string {
  return [
    contextBlock(ctx),
    "",
    `A job application form has a checkbox labelled: "${clean(labelText)}"`,
    "",
    "Should the candidate tick it, based only on the background above?",
    "",
    'Reply with exactly one word: "yes" or "no".',
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * The retry preamble. This is the whole point of A3: the form told us precisely
 * what was wrong, and that message is the only new information available on a
 * second attempt. Re-sending the same value learns nothing.
 */
function retryPreamble(previousAnswer: string, errorMessage: string): string {
  return [
    "A previous answer to this question was REJECTED by the form.",
    `Previous answer: "${clean(previousAnswer)}"`,
    `The form's error message: "${clean(errorMessage)}"`,
    "",
    "Provide a corrected answer that specifically addresses that error. Do not repeat the rejected answer.",
    "",
  ].join("\n")
}

export function buildOptionRetryPrompt(
  question: string,
  options: string[],
  previousAnswer: string,
  errorMessage: string,
  ctx: AnswerContext = {}
): string {
  return retryPreamble(previousAnswer, errorMessage) + buildOptionPrompt(question, options, ctx)
}

export function buildTextualRetryPrompt(
  question: string,
  previousAnswer: string,
  errorMessage: string,
  ctx: AnswerContext = {},
  maxChars?: number
): string {
  return retryPreamble(previousAnswer, errorMessage) + buildTextualPrompt(question, ctx, maxChars)
}

export function buildNumericRetryPrompt(
  question: string,
  previousAnswer: string,
  errorMessage: string,
  ctx: AnswerContext = {},
  defaultValue?: number
): string {
  return retryPreamble(previousAnswer, errorMessage) + buildNumericPrompt(question, ctx, defaultValue)
}

/**
 * Map a model's reply back onto a real option.
 *
 * The model is told to echo an option verbatim, but doesn't always: it adds
 * numbering, quotes, or trailing punctuation. Returns the INDEX so the caller
 * clicks a real DOM node rather than typing the model's text — which is what
 * makes the "model chose something not in the list" failure impossible.
 */
export function matchReplyToOption(reply: string, options: string[]): number {
  if (!reply || !options.length) return -1
  const norm = (s: string) =>
    String(s ?? "")
      .toLowerCase()
      .replace(/^\s*\d+[.)]\s*/, "") // leading "3." / "3)"
      .replace(/^["'`]+|["'`.]+$/g, "") // wrapping quotes, trailing period
      .replace(/[^a-z0-9]+/g, " ")
      .trim()

  const r = norm(reply)
  if (!r) return -1
  const n = options.map(norm)

  let i = n.indexOf(r)
  if (i >= 0) return i

  // The model answered with the option's number.
  const asNumber = /^\s*(\d{1,3})\b/.exec(reply.trim())
  if (asNumber) {
    const idx = Number(asNumber[1]) - 1
    if (idx >= 0 && idx < options.length) return idx
  }

  // Yes/no must match on the leading token so "No" can't select "Norway".
  if (r === "yes" || r === "no") {
    i = n.findIndex((x) => x.split(" ")[0] === r)
    if (i >= 0) return i
  }

  i = n.findIndex((x) => x && (x.startsWith(r) || r.startsWith(x)))
  if (i >= 0) return i
  i = n.findIndex((x) => x && (x.includes(r) || r.includes(x)))
  if (i >= 0) return i

  // Token overlap, with a floor — a weak match is worse than no match, because
  // selecting the wrong option submits a wrong answer on a real application.
  const rt = r.split(" ").filter(Boolean)
  let best = -1
  let bestScore = 0
  n.forEach((x, idx) => {
    if (!x) return
    const xt = new Set(x.split(" "))
    let hit = 0
    rt.forEach((t) => {
      if (xt.has(t)) hit++
    })
    const score = hit / Math.max(rt.length, 1)
    if (score > bestScore) {
      bestScore = score
      best = idx
    }
  })
  return bestScore >= 0.6 ? best : -1
}

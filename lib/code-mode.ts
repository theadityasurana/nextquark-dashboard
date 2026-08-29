/**
 * Code mode: let the model write a driver for a widget nothing else can drive.
 *
 * The field-handler registry covers checkboxes, radios, selects, dates,
 * typeaheads and text. When a control is none of those — a canvas rating
 * scale, a drag-to-order list, a bespoke multi-step picker — the run currently
 * has two moves left, and both are weak: ask the model to choose from options
 * it could not read, or hand the whole thing to `act()` and hope. Code mode is
 * the honest third option: give the model the element and let it write the
 * JavaScript.
 *
 * ── WHY THIS NEEDS GUARDRAILS AND THE REST OF THE FILE DOES NOT ──
 *
 * Every other DOM program in this codebase was written by a person and reviewed.
 * This one is written by a model, at run time, and executed against a live job
 * application belonging to a real candidate. Browserbase, whose template
 * introduced the pattern, says plainly that code mode "is not itself a security
 * sandbox".
 *
 * The specific thing at risk is this codebase's central invariant: **only
 * `clickSubmitButton` submits, and only after the audit gate passes.** Model
 * code running in the page can click anything. A half-filled application
 * submitted early cannot be recalled.
 *
 * So three layers, none of which is sufficient alone:
 *
 *   1. {@link screenCode} — reject code that mentions submitting, navigating,
 *      or reaching the network, before it runs.
 *   2. Execution is scoped to one field and wrapped so the program sees the
 *      target element rather than being handed the document.
 *   3. {@link verifyNoSideEffects} — the caller records the page's identity
 *      before and after, and treats a navigation or a vanished form as a
 *      failure of the whole run, not of the field.
 *
 * Code mode is off unless `KERNEL_CODE_MODE=1`. It is the last resort, and a
 * deployment that never turns it on loses only the handful of fields no handler
 * could drive anyway.
 */

/** Whether code mode may run at all. Off by default, deliberately. */
export const CODE_MODE_ENABLED = process.env.KERNEL_CODE_MODE === "1"

export interface ScreenResult {
  allowed: boolean
  /** Which rule rejected it, for the log. */
  reason: string | null
}

/**
 * Patterns that are never acceptable in model-authored field code.
 *
 * Each is here for a specific reason, not as generic hardening:
 *
 *  - submitting: the invariant this whole guard exists to protect
 *  - navigation: leaves the page mid-fill, stranding the run
 *  - network:    the model has no business talking to anything; the page's own
 *                data is what it was asked to manipulate
 *  - dynamic code: `eval`/`Function`/`import` defeat the screen itself, since
 *                the string that actually runs would never have been screened
 *  - storage/cookies: reading a candidate's session out of the page is not
 *                something filling a text field ever requires
 */
const FORBIDDEN: Array<{ re: RegExp; reason: string }> = [
  { re: /\.submit\s*\(|requestSubmit|\bform\.submit\b/i, reason: "calls form.submit()" },
  { re: /type\s*=\s*["']submit["']|\[type=["']?submit/i, reason: "targets a submit control" },
  // Separators matter: real markup writes these as `apply-now`, `apply_now`
  // and `applyNow` at least as often as with a space.
  { re: /\b(submit|apply[\s_-]*now|send[\s_-]*application|deploy)\b/i, reason: "mentions submitting or applying" },
  { re: /applyNow|submitApplication|sendApplication/i, reason: "targets a submit-like identifier" },
  { re: /location\s*(\.\s*(href|assign|replace)\s*=?|\s*=)|window\.open|history\.(push|replace)State|\.click\(\)\s*;?\s*\/\/\s*navigate/i, reason: "navigates the page" },
  { re: /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket\s*\(|EventSource\s*\(/i, reason: "makes a network request" },
  { re: /\beval\s*\(|new\s+Function|\bimport\s*\(|require\s*\(/i, reason: "builds and runs code dynamically" },
  { re: /document\.cookie|localStorage|sessionStorage|indexedDB/i, reason: "reads or writes browser storage" },
  { re: /\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;/i, reason: "contains an unbounded loop" },
  { re: /process\.|globalThis\.process|child_process/i, reason: "reaches for the Node process" },
]

/** Maximum program length. A field driver is a few lines; anything longer is not one. */
export const MAX_CODE_CHARS = 2000

/**
 * Decide whether a model-authored program may run.
 *
 * Rejects on the first matching rule. Deliberately blunt: a false rejection
 * costs one unfilled field the audit gate will surface, while a false accept
 * can submit someone's half-finished application.
 */
export function screenCode(code: string): ScreenResult {
  const src = (code || "").trim()
  if (!src) return { allowed: false, reason: "empty program" }
  if (src.length > MAX_CODE_CHARS) {
    return { allowed: false, reason: `program is ${src.length} characters, over the ${MAX_CODE_CHARS} limit` }
  }
  for (const { re, reason } of FORBIDDEN) {
    if (re.test(src)) return { allowed: false, reason }
  }
  return { allowed: true, reason: null }
}

/**
 * The prompt asking for a field driver.
 *
 * States the constraints the screen enforces, so a well-behaved model produces
 * something that passes rather than being rejected and retried. The screen is
 * still the authority — this is cooperation, not trust.
 */
export function buildCodeModePrompt(input: {
  label: string
  value: string
  kind: string
  /** Why the normal handler could not do it — the most useful context there is. */
  failureReason: string
  /** Outer HTML of the control and its immediate surroundings, already truncated. */
  html: string
}): string {
  return `A job application form has a control that standard automation could not fill.

Question: "${input.label}"
Detected widget kind: ${input.kind}
Value that needs to be entered: "${input.value}"
Why the standard handler failed: ${input.failureReason}

Here is the control and its surrounding markup:
\`\`\`html
${input.html.slice(0, 4000)}
\`\`\`

Write the body of an async JavaScript function that sets this control to the required value.

You are given:
  el      the target element (already located — do not search for it)
  sleep   async (ms) => void

Rules — code violating any of these is rejected before it runs:
- Touch only this control and its own descendants or its sibling option list.
- Never click, focus or reference any submit, apply or send control.
- Never navigate, open a window, or change the URL.
- Never call fetch, XMLHttpRequest, or any network API.
- Never use eval, new Function, import() or require().
- Never touch cookies or storage.
- No unbounded loops. Keep it under 30 lines.
- Dispatch input and change events after setting a value, so frameworks notice.
- Return { filled: true } on success, or { filled: false, reason: "..." }.

Return ONLY the function body as raw JavaScript. No markdown fence, no explanation.`
}

/**
 * Pull a runnable program out of a model reply.
 *
 * Strips a markdown fence if there is one, and refuses anything that still
 * looks like prose — a model that explained instead of coding must not have its
 * explanation executed.
 */
export function parseCodeReply(raw: string | null | undefined): string | null {
  if (!raw) return null
  let src = raw.trim()

  const fenced = src.match(/```(?:javascript|js)?\s*([\s\S]*?)```/)
  if (fenced) src = fenced[1].trim()

  if (!src) return null
  // A program has to actually do something with the element it was handed.
  if (!/\bel\b/.test(src)) return null
  // Prose gives itself away by having no statement punctuation at all.
  if (!/[;{}()]/.test(src)) return null
  return src
}

/** Page identity before and after a program runs, for the side-effect check. */
export interface PageMark {
  url: string
  formCount: number
  fieldCount: number
}

export interface SideEffectVerdict {
  clean: boolean
  /** What changed, when something did. */
  reason: string | null
}

/**
 * Compare the page before and after a model-authored program ran.
 *
 * This is the layer that catches what the static screen cannot: obfuscated
 * intent, an unexpected framework side effect, a click that bubbled somewhere
 * it should not have. A navigation or a form that vanished after filling one
 * field is the signature of an accidental submit, and the caller treats it as a
 * failure of the whole run — not something to retry.
 */
export function verifyNoSideEffects(before: PageMark, after: PageMark): SideEffectVerdict {
  if (before.url !== after.url) {
    return { clean: false, reason: `the page navigated (${before.url} → ${after.url})` }
  }
  if (before.formCount > 0 && after.formCount === 0) {
    return { clean: false, reason: "the form disappeared — this looks like an accidental submit" }
  }
  // Losing most of the form's controls is the same signature as a submit even
  // when the <form> element survives, which is what React-rendered ATSes do.
  if (before.fieldCount >= 4 && after.fieldCount <= Math.floor(before.fieldCount / 2)) {
    return {
      clean: false,
      reason: `the form lost most of its fields (${before.fieldCount} → ${after.fieldCount})`,
    }
  }
  return { clean: true, reason: null }
}

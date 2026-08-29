/**
 * Pure classifiers and value derivation for application form fields.
 *
 * Extracted from kernel.ts so they can be unit-tested — kernel.ts pulls in the
 * Kernel SDK and requires live env vars, so nothing inside it is testable.
 *
 * These answer the question "what kind of control is this label asking about,
 * and what value should go in it" — deterministically, with no model involved.
 * A date picker cannot do anything with the string "Immediately", and a consent
 * checkbox needs a boolean, not prose.
 */

/** True when a label is asking for a date rather than free text. */
export function isDateQuestion(label: string): boolean {
  return /\b(date|when can you|start(?:ing)? (?:date|day)|available from|availability date|pick date|mm\/dd|dd\/mm|yyyy)\b/i.test(
    label
  )
}

/**
 * True when a label is a consent / certification / acknowledgement checkbox —
 * the "I certify the above is true", "I agree to the privacy policy" controls
 * that gate submission on most ATS forms.
 */
export function isConsentQuestion(label: string): boolean {
  return /\b(i (?:hereby )?certify|i agree|i acknowledge|i consent|i confirm|i have read|i understand|terms and conditions|privacy (?:policy|notice)|gdpr|data protection)\b/i.test(
    label
  )
}

/**
 * A concrete start date for "when can you start" questions.
 *
 * `resolveAnswer` returns the string "Immediately", which is a fine answer for a
 * text box and useless for a date picker. Two weeks out is the honest default: a
 * standard notice period, and a date no employer reads as evasive. Weekends are
 * skipped forward — start dates are working days.
 */
export function defaultStartDate(userData: unknown, now: Date = new Date()): Date {
  const raw = (userData as { noticePeriodDays?: unknown } | null)?.noticePeriodDays
  const noticeDays = Number(raw)
  const days = Number.isFinite(noticeDays) && noticeDays > 0 ? noticeDays : 14
  const d = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  if (d.getDay() === 6) d.setDate(d.getDate() + 2) // Saturday → Monday
  if (d.getDay() === 0) d.setDate(d.getDate() + 1) // Sunday → Monday
  return d
}

/**
 * Pipe-separated date candidates, most-likely format first. The date-widget
 * handler tries each until one is accepted, because ATS forms disagree on
 * format and rarely say which they want.
 */
export function dateCandidates(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${mm}/${dd}/${yyyy}|${yyyy}-${mm}-${dd}|${dd}/${mm}/${yyyy}`
}

/**
 * Whether a pre-populated value already says what we would say.
 *
 * Deliberately loose. ATS résumé parsers normalize aggressively — "+91 98765
 * 43210" becomes "9876543210", "Bengaluru, KA, India" becomes "Bengaluru" —
 * and rewriting a field that is already right costs an action, risks tripping
 * a dirty-form warning, and can lose a country-code selection that was
 * correctly applied. So punctuation and case are ignored, and containment in
 * either direction counts as agreement.
 */
export function valuesAgree(existing: string, wanted: string): boolean {
  const norm = (s: string) =>
    (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").trim()
  const a = norm(existing)
  const b = norm(wanted)
  if (!a || !b) return false
  if (a === b) return true
  // Containment, but only when the shorter side is substantial — otherwise
  // "No" agrees with "Norway" and every two-letter answer matches everything.
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length < 4) return false
  return longer.includes(shorter)
}

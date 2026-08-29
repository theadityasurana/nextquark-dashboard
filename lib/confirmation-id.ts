/**
 * Confirmation / reference ID extraction from a post-submit page.
 *
 * `confirmSubmission` already decides *whether* a submission landed, from URL,
 * body text, and whether the form disappeared. That verdict is inference. Many
 * ATSes additionally print a reference the candidate can quote back — "Your
 * confirmation number is R-1043928" — and capturing it upgrades the run record
 * from "we believe this submitted" to receipt-grade proof. That matters when a
 * user disputes whether an application was actually sent.
 *
 * Pure and DOM-free so it can be unit-tested against captured page text.
 *
 * The extractor is deliberately conservative: a wrong ID shown as proof is worse
 * than no ID at all, so anything that looks like a date, a phone number, a money
 * amount, or a plain English word is rejected ({@link looksLikeId}).
 */

export interface ConfirmationIdMatch {
  id: string
  /** The label that introduced it, e.g. "confirmation number" — shown as context. */
  label: string
}

/**
 * Label → ID patterns, most specific first. Each must capture the ID in group 1.
 * The `[:#\s]` bridge tolerates "Confirmation #: ABC", "Confirmation number ABC",
 * and "Confirmation ID - ABC" without a separate pattern per punctuation style.
 */
const LABELLED_PATTERNS: Array<{ label: string; re: RegExp }> = [
  {
    label: "confirmation number",
    re: /confirmation\s*(?:number|no\.?|#|id|code)\s*(?:is)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{3,39})/i,
  },
  {
    label: "reference number",
    re: /(?:reference|ref\.?)\s*(?:number|no\.?|#|id|code)\s*(?:is)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{3,39})/i,
  },
  {
    label: "application ID",
    re: /application\s*(?:number|no\.?|#|id|code)\s*(?:is)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{3,39})/i,
  },
  {
    label: "candidate ID",
    re: /candidate\s*(?:number|no\.?|#|id)\s*(?:is)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{3,39})/i,
  },
  {
    label: "requisition ID",
    re: /(?:requisition|req\.?)\s*(?:number|no\.?|#|id)\s*(?:is)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{3,39})/i,
  },
  {
    label: "tracking number",
    re: /tracking\s*(?:number|no\.?|#|id|code)\s*(?:is)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{3,39})/i,
  },
]

/**
 * Portal-shaped IDs that appear with no introducing label — matched only after
 * every labelled pattern misses. Workday's `R-` requisition ids are the common
 * real-world case; the dashed-uppercase form covers ATSes that print a bare code
 * on the confirmation screen.
 */
const BARE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "requisition ID", re: /\bR-\d{5,12}\b/ },
  { label: "reference code", re: /\b[A-Z]{2,5}-[A-Z0-9]{4,12}-[A-Z0-9]{3,10}\b/ },
]

/** Tokens that are never an ID even when they follow an ID-ish label. */
const STOPWORDS = new Set([
  "the", "your", "this", "that", "and", "for", "with", "from", "will", "have",
  "been", "sent", "email", "below", "above", "shortly", "soon", "here", "was",
  "not", "available", "pending", "none", "null", "undefined", "unknown",
])

/**
 * Whether a captured token is plausibly an identifier rather than prose or a
 * date/phone/amount that happened to sit after the label.
 */
export function looksLikeId(raw: string): boolean {
  const s = raw.trim().replace(/[.,;:)\]]+$/, "")
  if (s.length < 4 || s.length > 40) return false
  if (STOPWORDS.has(s.toLowerCase())) return false

  // Must contain at least one digit — every real confirmation ref we've seen does,
  // and requiring it kills the large class of prose false positives.
  if (!/\d/.test(s)) return false

  // Dates: 2024-01-15, 01/15/2024, 15-01-2024.
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) return false
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(s)) return false

  // Times and money-ish leftovers.
  if (/^\d{1,2}:\d{2}/.test(s)) return false
  if (/^\d+\.\d{2}$/.test(s)) return false

  // Phone numbers: 10-11 bare digits, or a dashed NANP shape.
  const digitsOnly = s.replace(/\D/g, "")
  if (/^\d+$/.test(s) && digitsOnly.length >= 10 && digitsOnly.length <= 11) return false
  if (/^\d{3}-\d{3}-\d{4}$/.test(s)) return false

  // A bare year, or any short pure-digit run, carries no identifying weight.
  if (/^\d{1,4}$/.test(s)) return false

  return true
}

/** Trim trailing sentence punctuation a regex may have swept into the capture. */
function clean(raw: string): string {
  return raw.trim().replace(/[.,;:)\]]+$/, "")
}

/**
 * Best confirmation ID found in `bodyText`, or null when nothing is confidently
 * an ID. Labelled matches always beat bare pattern matches.
 *
 * `bodyText` should be rendered text (`document.body.innerText`), not HTML —
 * markup attributes are full of id-shaped strings that are not confirmations.
 */
export function extractConfirmationId(
  bodyText: string | null | undefined
): ConfirmationIdMatch | null {
  if (!bodyText) return null
  const text = bodyText.replace(/\s+/g, " ")

  for (const { label, re } of LABELLED_PATTERNS) {
    const m = re.exec(text)
    if (!m?.[1]) continue
    const id = clean(m[1])
    if (looksLikeId(id)) return { id, label }
  }

  for (const { label, re } of BARE_PATTERNS) {
    const m = re.exec(text)
    if (!m?.[0]) continue
    const id = clean(m[0])
    if (looksLikeId(id)) return { id, label }
  }

  return null
}

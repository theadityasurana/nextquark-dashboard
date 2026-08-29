/**
 * The email-only application channel.
 *
 * A meaningful share of postings — smaller companies, academic roles, agency
 * listings — have no form at all. The page says "send your CV to
 * careers@example.com" and that is the entire application process. Today those
 * runs reach the submit gate, find nothing to submit, and are recorded as
 * failures, which is both wrong and invisible: the posting looks broken rather
 * than differently-shaped.
 *
 * Detection is deliberately strict. A careers page footer contact address, a
 * recruiter's signature, a privacy-policy contact — none of those are an
 * application channel, and mailing a résumé to the wrong address on someone's
 * behalf is worse than recording a failure. So an address only counts when the
 * page explicitly directs applications to it, and only when no real application
 * form was found.
 *
 * Pure detection here; sending goes through the existing nodemailer transport.
 */


export interface EmailApplyTarget {
  address: string
  /** The sentence that nominated it — shown to the operator as justification. */
  evidence: string
}

/**
 * Phrases that turn a nearby address into an application channel.
 *
 * Each requires an *imperative directed at the applicant*. "Contact us at" is
 * excluded on purpose: it's the single most common way a page names an address
 * that is not for applications.
 */
const DIRECTIVE_PATTERNS: RegExp[] = [
  /\b(send|email|e-mail|forward|submit|mail)\b[^.\n]{0,60}\b(your\s+)?(cv|resume|résumé|application|cover letter|candidature)\b[^.\n]{0,60}/i,
  /\b(applications?|cvs?|resumes?|résumés?)\b[^.\n]{0,30}\b(should be|to be|can be|may be)?\s*(sent|emailed|e-mailed|submitted|addressed)\b[^.\n]{0,60}/i,
  /\bto apply\b[^.\n]{0,40}\b(email|e-mail|send|write)\b[^.\n]{0,60}/i,
  /\bapply\s+(by|via|through)\s+e-?mail\b[^.\n]{0,60}/i,
]

/** Addresses that are never an application channel, however they're phrased. */
const EXCLUDED_LOCAL_PARTS =
  /^(privacy|legal|dpo|gdpr|security|abuse|noreply|no-reply|donotreply|support|help|sales|marketing|press|media|info|webmaster|postmaster|billing|accounts?)$/i

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/**
 * Find the address a page directs applications to, or null.
 *
 * `hasForm` is a hard precondition rather than a hint: if the page has a real
 * application form, that form is the channel, and any address on the page is
 * something else. Emailing in that situation would duplicate an application.
 */
export function detectEmailApply(pageText: string, hasForm: boolean): EmailApplyTarget | null {
  if (hasForm) return null
  const text = (pageText || "").replace(/\s+/g, " ")
  if (!text) return null

  for (const pattern of DIRECTIVE_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, "gi"))
    if (!matches) continue
    for (const sentence of matches) {
      // The address must appear in the directive itself, or immediately after
      // it — not merely somewhere on the same page.
      const idx = text.indexOf(sentence)
      const window = text.slice(idx, idx + sentence.length + 120)
      const found = window.match(EMAIL_RE)
      if (!found) continue
      for (const address of found) {
        const local = address.split("@")[0]
        if (EXCLUDED_LOCAL_PARTS.test(local)) continue
        return { address: address.toLowerCase(), evidence: sentence.trim().slice(0, 200) }
      }
    }
  }
  return null
}

export interface EmailApplyInput {
  to: string
  candidateName: string
  candidateEmail: string
  jobTitle: string
  companyName: string
  /** Two or three sentences drawn from the candidate's real background. */
  pitch: string
  resumeUrl?: string | null
}

/**
 * Compose the application email.
 *
 * Kept plain and factual. An email application is read by a person, and the
 * padded-out cover-letter register that LLMs default to reads worse than three
 * direct sentences.
 */
export function buildApplicationEmail(i: EmailApplyInput): { subject: string; html: string } {
  const subject = `Application for ${i.jobTitle}${i.companyName ? ` — ${i.companyName}` : ""} · ${i.candidateName}`
  const html = `
<p>Hello,</p>
<p>I'd like to apply for the <strong>${escapeHtml(i.jobTitle)}</strong> role${
    i.companyName ? ` at ${escapeHtml(i.companyName)}` : ""
  }.</p>
<p>${escapeHtml(i.pitch)}</p>
${i.resumeUrl ? `<p>My résumé: <a href="${escapeHtml(i.resumeUrl)}">${escapeHtml(i.resumeUrl)}</a></p>` : ""}
<p>Happy to share anything else that would help.</p>
<p>Best regards,<br>${escapeHtml(i.candidateName)}<br>${escapeHtml(i.candidateEmail)}</p>
`.trim()
  return { subject, html }
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export interface EmailApplyResult {
  sent: boolean
  address: string
  reason: string
}

/**
 * Send the application. Reported as its own outcome, never as a form submission
 * — an operator looking at the queue must be able to tell the two apart.
 */
export async function sendApplicationEmail(i: EmailApplyInput): Promise<EmailApplyResult> {
  if (!i.to) return { sent: false, address: "", reason: "No target address" }
  try {
    const { subject, html } = buildApplicationEmail(i)
    // Imported lazily: email-service builds a Supabase client at module load, so
    // a static import would make the pure detection above untestable and would
    // couple every caller of this module to live credentials.
    const { sendEmail } = await import("./email-service")
    const res = await sendEmail({ to: i.to, subject, html, triggerType: "email_application" })
    return res?.success
      ? { sent: true, address: i.to, reason: `Application emailed to ${i.to}` }
      : { sent: false, address: i.to, reason: "Mail transport rejected the message" }
  } catch (err) {
    return {
      sent: false,
      address: i.to,
      reason: `Email send failed: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

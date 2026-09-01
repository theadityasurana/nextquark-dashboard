import { createClient } from "@supabase/supabase-js"
import { htmlToPlainText } from "@/lib/html-converter"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESEND_API_KEY = process.env.RESEND_API_KEY

function extractOtp(bodyText: string | null, bodyHtml: string | null): string | null {
  const plainFromHtml = bodyHtml ? htmlToPlainText(bodyHtml) : ""
  const sources = [bodyText, plainFromHtml].filter(Boolean).join(" ")
  if (!sources) return null

  const patterns = [
    /(?:code|otp|pin|token|password|verification|verify|security code)\s*(?:is|:|=|field[^:]*:)\s*([A-Za-z0-9]{4,10})/i,
    /(?:code|otp|pin|token|password|verification|verify)[^\n]*\n\s*([A-Za-z0-9]{4,10})/i,
    /\b(\d{6})\b/,
    /\b(\d{4,8})\b/,
  ]

  for (const pattern of patterns) {
    const match = sources.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

/**
 * Fetches OTP for a given application queue row.
 * Strategy:
 *   1. Poll DB `verification_otp` column (filled by webhook) — up to 45s
 *   2. If not found, try Resend List API as backup — scan recent emails for matching recipient
 *   3. Returns null if both fail (caller should fallback to browser-based method)
 */
/** Subjects that actually carry a code, as opposed to a receipt or a newsletter. */
const CODE_SUBJECT_RE =
  /security code|verification code|verify your|one[-\s]?time|confirm your email|\botp\b|access code|login code/i

/**
 * Narrowing rules for picking the right mail out of a shared inbox.
 *
 * `sinceMs`  — ignore anything that arrived before the submit that asked for a
 *              code. Without it a retry happily re-reads the code it just spent.
 * `company`  — the posting's company. Every candidate shares ONE proxy address,
 *              so with several applications in flight the inbox interleaves
 *              their codes and "newest mail to this address" is not "my code".
 */
export type OtpMatch = { sinceMs?: number; company?: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "")

/**
 * Ask Resend for the inbound mail that answers THIS submit, and pull the code out.
 *
 * Extracted so the poll loop can call it on every tick instead of only after the
 * DB poll gives up — see the comment in fetchOtpViaApi. Returns null on any
 * failure so a caller can simply try again on the next tick.
 *
 * ─── Why this is more than "find the first mail to this address" ───
 *
 * It used to be exactly that, and a live campaign showed what that costs. Four
 * applications ran at once against one proxy address, and the inbox held:
 *
 *   16:19  Security code for your application to LaunchDarkly
 *   16:17  Security code for your application to SingleStore
 *   16:16  Thank you for applying to Commvault
 *   16:14  Security code for your application to Commvault
 *
 * `.find()` returns the first match in a newest-first list, so whichever run
 * asked second was handed the other run's code. It typed a valid-looking code
 * that belonged to a different application, Greenhouse answered the resubmit
 * with another 428, and the run ended reporting eleven validation errors — with
 * nothing in the log to suggest the code had ever been the problem.
 *
 * The "Thank you for applying" line is the second trap: it carries no code, but
 * extractOtp's last pattern matches any 4–8 digit run, so a receipt could hand
 * back a job id as a security code. Subject has to be part of the decision.
 */
async function fetchFromResend(proxyEmail: string, match: OtpMatch = {}): Promise<string | null> {
  if (!proxyEmail) return null
  try {
    const listRes = await fetch("https://api.resend.com/emails/receiving?limit=20", {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    })
    if (!listRes.ok) return null
    const listData = await listRes.json()
    const emails: any[] = listData.data || []

    const wanted = norm(match.company || "")
    const scored = emails
      .filter((email) => {
        const recipients: string[] = Array.isArray(email.to) ? email.to : [email.to]
        if (!recipients.some((addr: string) => String(addr).toLowerCase() === proxyEmail.toLowerCase())) return false
        // Anything older than the request cannot be the answer to it.
        if (match.sinceMs) {
          const at = Date.parse(email.created_at || "")
          if (!Number.isFinite(at) || at < match.sinceMs) return false
        }
        return true
      })
      .map((email) => {
        const subject = String(email.subject || "")
        let score = 0
        if (CODE_SUBJECT_RE.test(subject)) score += 10
        if (wanted && norm(subject).includes(wanted)) score += 6
        return { email, score, at: Date.parse(email.created_at || "") || 0 }
      })
      // A mail that does not read like a code mail is never worth opening: at
      // best it has no code, at worst it has a number that looks like one.
      .filter((c) => c.score >= 10)
      // A company match outranks recency; among equals, newest wins.
      .sort((a, b) => b.score - a.score || b.at - a.at)

    // With a company to match on, refuse to guess: another run's code is worse
    // than no code, because it is indistinguishable from success until submit.
    const best = wanted ? scored.find((c) => c.score >= 16) : scored[0]
    if (!best) return null

    const detailRes = await fetch(`https://api.resend.com/emails/receiving/${best.email.id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    })
    if (!detailRes.ok) return null
    const detail = await detailRes.json()
    return extractOtp(detail.text, detail.html)
  } catch {
    return null
  }
}

export async function fetchOtpViaApi(
  applicationId: string,
  proxyEmail: string,
  maxWaitMs: number = 45000,
  match: OtpMatch = {}
): Promise<string | null> {
  const pollInterval = 3000
  const maxAttempts = Math.ceil(maxWaitMs / pollInterval)

  // ─── Both sources are polled TOGETHER, on every tick ───
  //
  // These used to run in sequence: the webhook column was polled to exhaustion
  // first, and only then was Resend asked. So a code that Resend already held
  // still cost the full DB timeout — a live run spent 64 seconds getting a code
  // that had arrived 4 seconds after submit, because the 45s poll had to expire
  // before anyone looked in the mailbox.
  //
  // The two are independent races, not fallbacks: the webhook may be quicker when
  // it fires, and Resend is authoritative when it does not fire at all (a run
  // driven outside the queue has no row for the webhook to write to, which is
  // exactly the case that timed out).
  //
  // Cheap to do both — one indexed row read and one list call per tick.
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await supabase
      .from("live_application_queue")
      .select("verification_otp")
      .eq("id", applicationId)
      .maybeSingle()

    if (data?.verification_otp) {
      console.log(`[OTP Fetcher] Got OTP from DB (webhook): ${data.verification_otp} after ${(i + 1) * pollInterval / 1000}s`)
      return data.verification_otp
    }

    // Skip the first tick: the portal has only just sent the mail, and Resend
    // needs a moment to receive it. Every tick after that asks.
    if (i > 0) {
      const early = await fetchFromResend(proxyEmail, match)
      if (early) {
        console.log(`[OTP Fetcher] Got OTP from Resend API: ${early} after ${(i + 1) * pollInterval / 1000}s`)
        return early
      }
    }

    await new Promise(r => setTimeout(r, pollInterval))
  }

  // One last look after the loop, in case the mail landed on the final tick.
  //
  // This used to be a second, independent copy of the Resend lookup — and when
  // fetchFromResend learned to filter by recency, subject and company, the copy
  // did not, so the timeout path could still hand back another run's code. One
  // implementation, one set of rules.
  console.log(`[OTP Fetcher] Poll window closed. Final Resend check for ${proxyEmail}...`)
  const otp = await fetchFromResend(proxyEmail, match)
  if (!otp) {
    console.log(`[OTP Fetcher] No usable code found in Resend for ${proxyEmail}` +
      (match.company ? ` (company "${match.company}")` : ""))
    return null
  }
  console.log(`[OTP Fetcher] Got OTP from Resend API: ${otp}`)
  // Write it to DB so it's available for reference.
  await supabase
    .from("live_application_queue")
    .update({ verification_otp: otp })
    .eq("id", applicationId)
    .then(undefined, () => {})
  return otp
}

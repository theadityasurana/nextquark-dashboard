import { createClient } from "@supabase/supabase-js"
import { htmlToPlainText } from "@/lib/html-converter"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_2ZFLsY9X_JtbZwnxNj9Rm8WyxNL6nJK74"

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
/**
 * Ask Resend for the newest inbound mail to this address and pull the code out.
 *
 * Extracted so the poll loop can call it on every tick instead of only after the
 * DB poll gives up — see the comment in fetchOtpViaApi. Returns null on any
 * failure so a caller can simply try again on the next tick.
 */
async function fetchFromResend(proxyEmail: string): Promise<string | null> {
  if (!proxyEmail) return null
  try {
    const listRes = await fetch("https://api.resend.com/emails/receiving?limit=20", {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    })
    if (!listRes.ok) return null
    const listData = await listRes.json()
    const emails = listData.data || []
    const hit = emails.find((email: any) => {
      const recipients: string[] = Array.isArray(email.to) ? email.to : [email.to]
      return recipients.some((addr: string) => String(addr).toLowerCase() === proxyEmail.toLowerCase())
    })
    if (!hit) return null
    const detailRes = await fetch(`https://api.resend.com/emails/receiving/${hit.id}`, {
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
  maxWaitMs: number = 45000
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
      const early = await fetchFromResend(proxyEmail)
      if (early) {
        console.log(`[OTP Fetcher] Got OTP from Resend API: ${early} after ${(i + 1) * pollInterval / 1000}s`)
        return early
      }
    }

    await new Promise(r => setTimeout(r, pollInterval))
  }

  // One last look after the loop, in case the mail landed on the final tick.
  console.log(`[OTP Fetcher] Poll window closed. Final Resend check for ${proxyEmail}...`)
  try {
    const listRes = await fetch("https://api.resend.com/emails/receiving?limit=20", {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    })

    if (!listRes.ok) {
      console.error(`[OTP Fetcher] Resend List API failed: ${listRes.status}`)
      return null
    }

    const listData = await listRes.json()
    const emails = listData.data || []

    // Find the most recent email sent to this proxy address
    const matchingEmail = emails.find((email: any) => {
      const recipients: string[] = Array.isArray(email.to) ? email.to : [email.to]
      return recipients.some((addr: string) => addr.toLowerCase() === proxyEmail.toLowerCase())
    })

    if (!matchingEmail) {
      console.log(`[OTP Fetcher] No matching email found in Resend for ${proxyEmail}`)
      return null
    }

    // Fetch the full email body
    const detailRes = await fetch(`https://api.resend.com/emails/receiving/${matchingEmail.id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    })

    if (!detailRes.ok) {
      console.error(`[OTP Fetcher] Failed to fetch email detail: ${detailRes.status}`)
      return null
    }

    const emailDetail = await detailRes.json()
    const otp = extractOtp(emailDetail.text, emailDetail.html)

    if (otp) {
      console.log(`[OTP Fetcher] Got OTP from Resend API: ${otp}`)
      // Write it to DB so it's available for reference
      await supabase
        .from("live_application_queue")
        .update({ verification_otp: otp })
        .eq("id", applicationId)
      return otp
    }

    console.log("[OTP Fetcher] Email found but no OTP could be extracted")
    return null
  } catch (err) {
    console.error("[OTP Fetcher] Resend API error:", err)
    return null
  }
}

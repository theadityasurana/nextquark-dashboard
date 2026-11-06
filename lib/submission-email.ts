/**
 * The employer's own confirmation email: the strongest proof a submission landed.
 *
 * A page can stay put after Submit or show its thank-you late, but an ATS only
 * sends this mail once it has the application. So any row that clicked Submit and
 * has one of these is completed, whatever the page check concluded.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

const CONFIRMATION_RE =
  /thank(s| you)[^.]{0,40}(appl|interest)|application (to|for|was|has been|received)|your application|we('ve| have) received|successfully (applied|submitted)|received your application/i

/** A verification code is sent BEFORE a submission completes, so it proves nothing. */
const NOT_CONFIRMATION_RE = /security code|verification code|verify your|one[- ]time|otp\b|unfortunately|not (moving|proceed)/i

export function isConfirmationEmail(
  email: { subject?: string | null; from_email?: string | null; from_name?: string | null; body_text?: string | null },
  companyName: string
): boolean {
  const subject = email.subject || ""
  if (NOT_CONFIRMATION_RE.test(subject) || !CONFIRMATION_RE.test(subject)) return false
  const company = companyName.trim().toLowerCase()
  if (!company) return false
  const haystack = `${subject} ${email.from_email || ""} ${email.from_name || ""} ${(email.body_text || "").slice(0, 3000)}`
  return haystack.toLowerCase().includes(company)
}

const CODE_SUBJECT_RE = /security code|verification code|verify your|one[-\s]?time|confirm your email|\botp\b|access code|login code/i
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "")

/**
 * The verification-code mail answering this submit, newest first. Candidates apply
 * to several jobs at once through one address, so with a company to match, another
 * company's code is never returned: it would look valid until the submit bounced.
 */
export function pickCodeEmail<T extends { subject?: string | null; received_at?: string | null }>(
  emails: T[],
  match: { sinceMs?: number; company?: string }
): T | null {
  const wanted = squash(match.company || "")
  const usable = emails
    .filter((e) => CODE_SUBJECT_RE.test(e.subject || ""))
    .filter((e) => !match.sinceMs || Date.parse(e.received_at || "") >= match.sinceMs)
    .filter((e) => !wanted || squash(e.subject || "").includes(wanted))
    .sort((a, b) => Date.parse(b.received_at || "") - Date.parse(a.received_at || ""))
  return usable[0] ?? null
}

/** Rows whose run clicked Submit but could not confirm it. */
const UNCONFIRMED_FILTER = "last_error.ilike.%clicked submit%,last_error.ilike.%Submit was clicked%"

/**
 * Mark completed any unconfirmed row whose confirmation email has since arrived.
 * Only mail received after the row's run started counts. Returns what it changed.
 */
export async function reconcileSubmissionsFromEmail(supabase: SupabaseClient): Promise<string[]> {
  const { data: rows, error } = await supabase
    .from("live_application_queue")
    .select("id, email, company_name, first_name, started_at, created_at")
    .eq("status", "failed")
    .or(UNCONFIRMED_FILTER)
  if (error) throw new Error(error.message)
  if (!rows?.length) return []

  const addresses = [...new Set(rows.map((r) => String(r.email || "").toLowerCase()).filter(Boolean))]
  const { data: mail, error: mailError } = await supabase
    .from("inbound_emails")
    .select("to_email, proxy_address, from_email, from_name, subject, body_text, received_at")
    .in("to_email", addresses)
    .gte("received_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
  if (mailError) throw new Error(mailError.message)

  const changed: string[] = []
  for (const row of rows) {
    const after = new Date(row.started_at || row.created_at).getTime()
    const proof = (mail ?? []).find(
      (m) =>
        String(m.to_email || "").toLowerCase() === String(row.email || "").toLowerCase() &&
        new Date(m.received_at).getTime() >= after - 60_000 &&
        isConfirmationEmail(m, row.company_name || "")
    )
    if (!proof) continue
    const { error: updateError } = await supabase
      .from("live_application_queue")
      .update({ status: "completed", completed_at: proof.received_at, last_error: null, error_message: null })
      .eq("id", row.id)
      .eq("status", "failed")
    if (updateError) throw new Error(updateError.message)
    await supabase.from("application_logs").insert({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      application_id: row.id,
      level: "info",
      agent_id: row.id,
      message: `[Submission] CONFIRMED BY EMAIL: "${proof.subject}" from ${proof.from_email} at ${proof.received_at}`,
    })
    changed.push(`${row.company_name}/${row.first_name}: "${String(proof.subject).slice(0, 70)}"`)
  }
  return changed
}

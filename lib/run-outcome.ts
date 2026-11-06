/**
 * What a finished run means for its queue row, and whether a posting is dead.
 *
 * Pure functions, so which tab a row lands in can be tested without a browser.
 * Deleting is irreversible and acts on a real person's application, so only
 * unambiguous evidence counts as "dead": a 403 or a timeout proves nothing, since
 * bot walls return those for live postings.
 */

export type RunAction =
  | { kind: "completed" }
  | { kind: "retry"; backoffSeconds: number; countsAsAttempt: boolean }
  | { kind: "failed" }
  | { kind: "blocked" }
  | { kind: "awaiting_captcha" }
  | { kind: "awaiting_otp" }
  | { kind: "delete"; reason: string }

export interface RunResultLike {
  success?: boolean
  error?: string | null
  failure?: { failureClass?: string; rootCause?: string; permanent?: boolean } | null
}

/** Our account or infrastructure failed. The posting is fine, so no try is spent. */
const INFRA_RE = /plan needs payment method|write operations are blocked|invalid or disabled api key|rate limit|retry-after|browser provider|concurrent.session|session cap|request timed out|connection error|browser session no longer exists/i

const RETRY_BACKOFF_SECONDS = 120
const INFRA_BACKOFF_SECONDS = 300

export function decideRunAction(result: RunResultLike, attempt: number, maxAttempts: number): RunAction {
  if (result.success) return { kind: "completed" }

  const cls = result.failure?.failureClass
  if (cls === "expired" || cls === "not_application") {
    return { kind: "delete", reason: result.failure?.rootCause || cls }
  }
  // Worth another try: the retry gets a residential IP. Filed for a person after that.
  if (/bot check is in front of this page/i.test(result.error || "")) {
    return attempt < maxAttempts ? { kind: "retry", backoffSeconds: RETRY_BACKOFF_SECONDS, countsAsAttempt: true } : { kind: "awaiting_captcha" }
  }
  // Checked before captcha: reCAPTCHA v3 on the page made these read as a CAPTCHA.
  if (/verification code email never arrived/i.test(result.error || "")) {
    return attempt < maxAttempts ? { kind: "retry", backoffSeconds: RETRY_BACKOFF_SECONDS, countsAsAttempt: true } : { kind: "awaiting_otp" }
  }
  if (cls === "captcha" || /captcha was not solved/i.test(result.error || "")) return { kind: "awaiting_captcha" }
  if (cls === "anti_bot" && attempt < 2) {
    return { kind: "retry", backoffSeconds: 600, countsAsAttempt: true }
  }
  if (result.failure?.permanent) return { kind: "blocked" }
  // It may have gone through, and a retry would apply a second time.
  if (/clicked submit/i.test(result.error || "") && !/verification code email never arrived/i.test(result.error || "")) return { kind: "failed" }
  if (INFRA_RE.test(result.error || "")) {
    return { kind: "retry", backoffSeconds: INFRA_BACKOFF_SECONDS, countsAsAttempt: false }
  }
  if (attempt < maxAttempts) {
    return { kind: "retry", backoffSeconds: RETRY_BACKOFF_SECONDS, countsAsAttempt: true }
  }
  return { kind: "failed" }
}

const CLOSED_TEXT_RE = /(job|position|posting|role|opening)[^.]{0,40}(no longer (available|open|accepting)|has been (filled|closed|removed)|is closed|not found)|no longer accepting applications/i

/** Decide from a fetched page. Returns the reason if the posting is dead, else null. */
export function classifyLiveness(input: { status: number; finalUrl: string; text?: string }): string | null {
  if (input.status === 404 || input.status === 410) return `The job URL returned HTTP ${input.status}`
  // Greenhouse redirects a closed job to the company board with this marker.
  if (/[?&]error=true\b/.test(input.finalUrl)) return "The job board redirected with error=true: the posting is closed"
  if (input.status === 200 && input.text && CLOSED_TEXT_RE.test(input.text.slice(0, 20000))) {
    return "The page says this posting is closed"
  }
  return null
}

/**
 * The board and job in a Greenhouse link. The EU boards are left out because the
 * public API does not reliably serve them, and a false 404 here deletes the row.
 */
export function greenhousePosting(url: string): { board: string; jobId: string } | null {
  const m = url.match(/^https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/i)
  return m ? { board: m[1], jobId: m[2] } : null
}

/**
 * Check the posting before paying for a browser session. Any network error or
 * unexpected status returns null, which lets the run proceed.
 */
export async function checkJobLiveness(url: string, timeoutMs = 10_000): Promise<string | null> {
  const posting = greenhousePosting(url)
  if (posting) {
    try {
      const api = await fetch(`https://boards-api.greenhouse.io/v1/boards/${posting.board}/jobs/${posting.jobId}`, { signal: AbortSignal.timeout(timeoutMs) })
      if (api.status === 404) return "Greenhouse says this posting no longer exists"
    } catch {}
  }
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36" },
    })
    const text = res.status === 200 ? await res.text() : ""
    return classifyLiveness({ status: res.status, finalUrl: res.url || url, text })
  } catch {
    return null
  }
}

/**
 * Why this candidate has no usable résumé, or null if they do. Only a definite
 * answer counts: a network error or 5xx lets the run proceed, because the result
 * of this check is that the application gets deleted.
 */
export function classifyResume(url: string, status: number | null): string | null {
  if (!url) return "The candidate has no résumé on file"
  if (status !== null && status >= 400 && status < 500) return `The candidate's résumé link is broken (HTTP ${status})`
  return null
}

export async function checkResume(url: string, timeoutMs = 15_000): Promise<string | null> {
  if (!url) return classifyResume(url, null)
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) })
    return classifyResume(url, res.status)
  } catch {
    return null
  }
}

/** Likely Greenhouse board names for a company-hosted job link. */
export function greenhouseBoardCandidates(url: string, companyName: string): string[] {
  let hostLabel = ""
  try {
    hostLabel = new URL(url).hostname.replace(/^www\./, "").replace(/^(careers|jobs)\./, "").split(".")[0].replace(/careers$/, "")
  } catch {}
  const nameLabel = (companyName || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return [...new Set([hostLabel, nameLabel].filter(Boolean))]
}

/**
 * A company careers link carrying gh_jid names a Greenhouse job, but the page
 * itself is often a search listing or a shell around the form. Greenhouse's public
 * API confirms the real posting without a browser. Returns the direct form URL,
 * or null when this is not such a link or no board has that job.
 */
export async function resolveDirectApplyUrl(url: string, companyName: string, timeoutMs = 10_000): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const jobId = parsed.searchParams.get("gh_jid")
  if (!jobId || /(^|\.)greenhouse\.io$/.test(parsed.hostname)) return null
  for (const board of greenhouseBoardCandidates(url, companyName)) {
    try {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`, { signal: AbortSignal.timeout(timeoutMs) })
      // The embed, because many companies redirect /<board>/jobs/<id> to their own site.
      if (res.ok) return `https://job-boards.greenhouse.io/embed/job_app?for=${board}&token=${jobId}`
    } catch {}
  }
  return null
}

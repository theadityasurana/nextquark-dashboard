/**
 * Failure taxonomy: turn "the run failed" into a class, a cause, and a decision
 * about whether it is worth trying again.
 *
 * Today a failed run leaves `classifyError`'s `{level, message}` and some free
 * text on the run timeline. Two things follow from that, and both are wrong:
 *
 *  1. **Every failure re-enters the retry queue.** A posting that closed last
 *     week will be retried forever, because nothing distinguishes "the job is
 *     gone" from "the proxy hiccuped".
 *  2. **Every failure counts against the portal's circuit breaker.** Three
 *     expired postings in a row currently trip Greenhouse open for everyone,
 *     even though Greenhouse was working perfectly each time.
 *
 * {@link diagnose} fixes both by classifying from run signals and returning
 * `permanent` (never retry) and `portalFault` (only these should move the
 * breaker) alongside a human-readable cause and next action.
 *
 * Pure and dependency-free, so the whole table is unit-testable.
 */

export type FailureClass =
  | "expired"           // posting closed or no longer accepting
  | "captcha"           // blocked by an unsolved challenge
  | "login_required"    // account/SSO wall we will not cross
  | "not_application"   // the page is not a job application at all
  | "anti_bot"          // portal rejected the submission as automated
  | "form_incomplete"   // audit gate refused: required fields unfilled
  | "validation"        // the form itself rejected our values
  | "stuck"             // loop detected; no progress being made
  | "timeout"           // exceeded the time budget
  | "portal_error"      // 5xx, blank page, broken ATS
  | "infra"             // our side: browser session, proxy, LLM provider
  | "unknown"

export interface RunSignals {
  /** Error strings collected during the run (exceptions, act() failures). */
  errors?: string[]
  /** Page text observed after the submit attempt. */
  pageText?: string
  finalUrl?: string
  /** Required inventory items still unfilled at the submit gate. */
  unfilledRequired?: string[]
  /** Validation messages the form itself produced. */
  validationErrors?: string[]
  loopDetected?: boolean
  timedOut?: boolean
  captchaUnresolved?: boolean
  antiBotBlocked?: boolean
  /** Set by the not-a-job-application gate. */
  unsafePage?: string | null
  /** True when an LLM provider call failed (402, 429, 5xx). */
  llmError?: boolean
}

export interface Diagnosis {
  failureClass: FailureClass
  /** One line an operator can act on. */
  rootCause: string
  suggestedAction: string
  /**
   * Terminal for this posting — must not be re-queued. Retrying a permanent
   * failure burns a session to reach the identical outcome.
   */
  permanent: boolean
  /**
   * Whether this failure is evidence the *portal* is broken. Only these should
   * move the circuit breaker; a bad résumé URL or a closed posting says nothing
   * about Greenhouse's health.
   */
  portalFault: boolean
}

const EXPIRED_RE = /no longer (accepting|available)|position (has been )?(closed|filled)|posting (is )?(closed|expired)|job (is )?(closed|no longer)|requisition .{0,20}closed|this job has expired/i
const LOGIN_RE = /sign in to (continue|apply)|create an account|log ?in to apply|please sign in|authentication required|session expired/i
const SSO_RE = /accounts\.google\.com|login\.microsoftonline\.com|okta\.com|onelogin\.com|auth0\.com/i
const PORTAL_ERROR_RE = /internal server error|service unavailable|502 bad gateway|503|something went wrong|temporarily unavailable/i
const INFRA_RE = /econnreset|etimedout|socket hang up|proxy|browser (session|has been) (closed|disconnected)|target closed|cdp|websocket|out of memory|oom/i
const LLM_RE = /rate limit|429|quota|insufficient_quota|402|api key|unauthorized|model .{0,20}not found/i

/**
 * A refusal from the BROWSER provider, not a model provider.
 *
 * Deliberately specific: it names the vendor or the resource, because the generic
 * words it shares with LLM_RE ("rate limit", "429", "quota") are exactly what made
 * these get misattributed in the first place.
 */
const BROWSER_QUOTA_RE =
  /\b(kernel|browserbase)\b[^.]{0,40}\b(rate limit|429|quota|capacity)|concurrent browser capacity|would exceed your concurrent|browser pool|no (browser|session)s? available/i

/**
 * Classify a failed run.
 *
 * Order is the specification: the most specific and most terminal conditions
 * are tested first, so a run that hit an anti-bot block is never reported as
 * "form incomplete" simply because the audit list was also non-empty.
 */
export function diagnose(s: RunSignals): Diagnosis {
  const haystack = [
    ...(s.errors ?? []),
    s.pageText ?? "",
    ...(s.validationErrors ?? []),
  ].join(" ")
  const url = s.finalUrl ?? ""

  // 1. The page was never an application. Terminal, and says nothing about the portal.
  if (s.unsafePage) {
    return {
      failureClass: "not_application",
      rootCause: s.unsafePage,
      suggestedAction: "Remove this posting from the queue — it is not a standard job application form.",
      permanent: true,
      portalFault: false,
    }
  }

  // 2. Posting closed. Terminal. Checked before everything mechanical, because a
  //    closed posting also produces empty forms and failed submits.
  if (EXPIRED_RE.test(haystack)) {
    return {
      failureClass: "expired",
      rootCause: "The posting is closed or no longer accepting applications.",
      suggestedAction: "Mark the job as expired and stop re-queuing it.",
      permanent: true,
      portalFault: false,
    }
  }

  // 3. Anti-bot rejection. Terminal for this run: re-submitting deepens the block.
  if (s.antiBotBlocked) {
    return {
      failureClass: "anti_bot",
      rootCause: "The portal rejected the submission as automated.",
      suggestedAction: "Do not retry from this IP. Rotate the proxy pool and consider slowing the fill pace for this portal.",
      permanent: true,
      portalFault: true,
    }
  }

  // 4. Unresolved challenge.
  if (s.captchaUnresolved) {
    return {
      failureClass: "captcha",
      rootCause: "A CAPTCHA was present and neither the solver nor an operator cleared it.",
      suggestedAction: "Retry later, or clear it by hand through the live view. Check the solver key if this repeats.",
      permanent: false,
      portalFault: false,
    }
  }

  // 5. Login / SSO wall. Terminal without credentials we deliberately don't hold.
  if (SSO_RE.test(url) || LOGIN_RE.test(haystack)) {
    return {
      failureClass: "login_required",
      rootCause: "The application is behind an account or SSO wall.",
      suggestedAction: "Needs a human with credentials, or a pre-authenticated profile for this employer.",
      permanent: true,
      portalFault: false,
    }
  }

  // 6. Our own infrastructure. Retryable, and explicitly not the portal's fault.

  // ── The browser provider, checked BEFORE the LLM ──
  //
  // LLM_RE matches the bare words "rate limit" and "429" wherever they appear, so
  // "Kernel rate limit exceeded" and "would exceed your concurrent browser
  // capacity" were both reported as "An LLM provider call failed (quota, rate
  // limit, or bad key)" with the advice to check provider credits. That sends the
  // operator to the wrong dashboard entirely: the LLM keys are fine and the
  // browser pool is full.
  if (BROWSER_QUOTA_RE.test(haystack)) {
    return {
      failureClass: "infra",
      rootCause: "The browser provider refused a new session (rate limit or concurrent-session cap).",
      suggestedAction: "Wait for running sessions to finish, or raise the browser concurrency limit. Retry after.",
      permanent: false,
      portalFault: false,
    }
  }

  if (s.llmError || LLM_RE.test(haystack)) {
    return {
      failureClass: "infra",
      rootCause: "An LLM provider call failed (quota, rate limit, or bad key).",
      suggestedAction: "Check provider credits and keys in Settings. Retry once resolved.",
      permanent: false,
      portalFault: false,
    }
  }
  if (INFRA_RE.test(haystack)) {
    return {
      failureClass: "infra",
      rootCause: "The browser session or network failed mid-run.",
      suggestedAction: "Retry. If it repeats across portals, check the browser provider and proxy pool.",
      permanent: false,
      portalFault: false,
    }
  }

  if (s.timedOut) {
    return {
      failureClass: "timeout",
      rootCause: "The run exceeded its time budget.",
      suggestedAction: "Retry with a longer timeout for this portal, or check whether the form is unusually long.",
      permanent: false,
      portalFault: true,
    }
  }

  if (PORTAL_ERROR_RE.test(haystack)) {
    return {
      failureClass: "portal_error",
      rootCause: "The ATS returned a server error or a broken page.",
      suggestedAction: "Retry later. Repeated occurrences should trip the portal breaker.",
      permanent: false,
      portalFault: true,
    }
  }

  if (s.loopDetected) {
    return {
      failureClass: "stuck",
      rootCause: "The run stopped making progress — the same page was reached repeatedly.",
      suggestedAction: "Inspect the replay. Usually an unread validation error or a widget no handler drives.",
      permanent: false,
      portalFault: true,
    }
  }

  if ((s.validationErrors?.length ?? 0) > 0) {
    return {
      failureClass: "validation",
      rootCause: `The form rejected our values: ${s.validationErrors!.slice(0, 3).join("; ")}`,
      suggestedAction: "Check the answer bank entries for those fields; the expected format probably differs.",
      permanent: false,
      portalFault: false,
    }
  }

  if ((s.unfilledRequired?.length ?? 0) > 0) {
    return {
      failureClass: "form_incomplete",
      rootCause: `Required field(s) could not be filled: ${s.unfilledRequired!.slice(0, 4).join(", ")}`,
      suggestedAction: "Add answers for these to the candidate's answer bank, or add a handler if the widget is unsupported.",
      permanent: false,
      portalFault: false,
    }
  }

  return {
    failureClass: "unknown",
    rootCause: (s.errors?.[0] ?? "The run failed without a recognized cause.").slice(0, 200),
    suggestedAction: "Inspect the run timeline and replay.",
    permanent: false,
    portalFault: false,
  }
}

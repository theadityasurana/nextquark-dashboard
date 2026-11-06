/**
 * The gate for pages that are not job applications — or are ones we must not
 * complete on a real person's behalf.
 *
 * `waitForApplicationForm` proves a form exists. It cannot tell an application
 * form from a contractor-marketplace onboarding, a talent-network signup, or a
 * flow demanding a selfie and a government ID. Those all render inputs, so they
 * all sail through, and the automation then fills them in someone's name.
 *
 * Two categories, and the distinction matters:
 *
 *  - **wrong_flow** — this is not a job application. A freelancing marketplace
 *    profile, a skills-assessment platform, a talent-network mailing list. No
 *    harm in the page itself; it is simply not the thing we were asked to do,
 *    and completing it wastes a session and pollutes the applied-to record.
 *
 *  - **unsafe** — the flow asks for something automation must never provide on
 *    a candidate's behalf: biometric capture, government ID upload, payment
 *    details, a national identity number, or device permissions. These are
 *    hard stops regardless of what the operator queued.
 *
 * Pure and DOM-free: it reads a URL plus page text, so it is fully testable.
 */

export type UnsafeKind = "wrong_flow" | "unsafe" | "sso" | "not_application"

export interface UnsafePageVerdict {
  blocked: boolean
  kind: UnsafeKind | null
  /** Operator-facing reason, written to the queue card and the diagnosis. */
  reason: string | null
  /** The specific signal that fired, for the log. */
  signal: string | null
}

const ALLOW: UnsafePageVerdict = { blocked: false, kind: null, reason: null, signal: null }

/**
 * Contractor marketplaces and talent networks. These are not employers and the
 * flow behind them is a profile build, not an application — matched on host so
 * a job description that merely *mentions* Upwork is not blocked.
 */
const MARKETPLACE_HOSTS = [
  "mercor.com",
  "toptal.com",
  "upwork.com",
  "fiverr.com",
  "turing.com",
  "andela.com",
  "gun.io",
  "contra.com",
  "arc.dev",
  "braintrust.com",
]

/** SSO/identity providers. We never sign in to these. */
const SSO_HOSTS = [
  "accounts.google.com",
  "login.microsoftonline.com",
  "login.live.com",
  "okta.com",
  "onelogin.com",
  "auth0.com",
  "signin.aws.amazon.com",
  "appleid.apple.com",
]

/**
 * Page-text signals for a flow that is not an application.
 *
 * Written to need an unambiguous phrase. "Set your hourly rate" only appears on
 * marketplaces; "rate" alone appears everywhere, so it is not used.
 */
const WRONG_FLOW_TEXT: Array<{ re: RegExp; label: string }> = [
  { re: /set your (hourly )?rate|your hourly rate|choose your rate/i, label: "asks the candidate to set an hourly contractor rate" },
  { re: /join our talent (network|community|pool)|talent network signup/i, label: "a talent-network signup, not an application" },
  { re: /create your (freelancer|contractor|expert) profile/i, label: "a freelancer profile builder" },
  { re: /take (a|the|this) (coding )?assessment to (apply|continue|get started)/i, label: "an assessment platform rather than an application form" },
  { re: /download (and install )?our (desktop )?(app|client|software) to (continue|apply)/i, label: "requires installing software to continue" },
  { re: /set your availability calendar|book (an|your) (interview )?slot to apply/i, label: "a scheduling flow, not an application" },
]

/**
 * Hard stops. Each of these is something a person must decide for themselves,
 * and none can be answered from a résumé.
 */
const UNSAFE_TEXT: Array<{ re: RegExp; label: string }> = [
  { re: /\b(take|upload) a selfie|selfie verification|face (scan|verification|capture)|liveness check\b/i, label: "biometric / selfie verification" },
  { re: /upload (a photo of )?(your )?(government|photo) (issued )?id|passport (photo|scan)|driver'?s licen[cs]e (photo|scan|upload)/i, label: "government ID upload" },
  // Worded as a request: a fintech's job description says "credit card" and
  // "billing address" freely, and matching those words deleted real applications.
  { re: /\b(enter|provide|add|submit|confirm) (your|a|the) (credit card|debit card|card number|billing address|payment (details|information|method))\b|\bcvv\b/i, label: "payment details" },
  // National identity / tax numbers are NOT a hard stop any more. Abandoning the
  // whole posting over one field meant a form whose other 22 inputs were filled
  // correctly produced no application at all. They are answered with a reserved
  // placeholder instead — see the `national_id` rule in answer-policy — which
  // fills the field without asserting a real person's identifier.
  { re: /\b(enter|provide|add|submit|confirm) (your|a|the) (bank account|routing number|ifsc|account number)\b/i, label: "bank account details" },
  { re: /(allow|enable|grant) (access to )?(your )?(camera|microphone|webcam|screen sharing)|record (a|your) video (introduction|answer)/i, label: "camera / microphone access or a video recording" },
  { re: /install (this )?(browser )?extension to (apply|continue)|proctoring software/i, label: "an installed extension or proctoring software" },
]

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

function hostMatches(host: string, needles: string[]): string | null {
  return needles.find((n) => host === n || host.endsWith(`.${n}`)) ?? null
}

/**
 * Evaluate a landed page before any field is filled.
 *
 * Called post-navigation and pre-fill, so the session is already paid for — but
 * everything expensive (the inventory scan, the LLM plan, the fill loop, the
 * submit) is still ahead, and that is what this saves.
 *
 * Ordering: SSO first (cheapest and unambiguous), then unsafe (the hard stops),
 * then wrong_flow. Unsafe is checked before wrong_flow so a marketplace that
 * *also* wants a selfie is reported as the more serious of the two.
 */
export function evaluatePage(url: string, pageText: string): UnsafePageVerdict {
  const host = hostOf(url)
  const text = (pageText || "").slice(0, 20_000)

  const sso = hostMatches(host, SSO_HOSTS)
  if (sso) {
    return {
      blocked: true,
      kind: "sso",
      reason: `Landed on an SSO sign-in page (${sso}). This application needs credentials we deliberately don't hold.`,
      signal: `sso-host:${sso}`,
    }
  }

  for (const { re, label } of UNSAFE_TEXT) {
    if (re.test(text)) {
      return {
        blocked: true,
        kind: "unsafe",
        reason: `Stopped: this flow asks for ${label}. Automation must not provide that on a candidate's behalf.`,
        signal: `unsafe:${label}`,
      }
    }
  }

  const marketplace = hostMatches(host, MARKETPLACE_HOSTS)
  if (marketplace) {
    return {
      blocked: true,
      kind: "wrong_flow",
      reason: `${marketplace} is a contractor marketplace, not an employer application. Nothing was filled.`,
      signal: `marketplace-host:${marketplace}`,
    }
  }

  for (const { re, label } of WRONG_FLOW_TEXT) {
    if (re.test(text)) {
      return {
        blocked: true,
        kind: "wrong_flow",
        reason: `Stopped: the page is ${label}.`,
        signal: `wrong-flow:${label}`,
      }
    }
  }

  return ALLOW
}

/**
 * Whether a URL should be refused before navigation even happens.
 *
 * Cheaper than {@link evaluatePage} and usable in pre-flight, where we have the
 * job URL but no page. Only host-level signals are available here.
 */
export function evaluateUrl(url: string): UnsafePageVerdict {
  const host = hostOf(url)
  const sso = hostMatches(host, SSO_HOSTS)
  if (sso) {
    return {
      blocked: true,
      kind: "sso",
      reason: `This URL is an SSO sign-in page (${sso}), not an application form.`,
      signal: `sso-host:${sso}`,
    }
  }
  const marketplace = hostMatches(host, MARKETPLACE_HOSTS)
  if (marketplace) {
    return {
      blocked: true,
      kind: "wrong_flow",
      reason: `${marketplace} is a contractor marketplace, not an employer application.`,
      signal: `marketplace-host:${marketplace}`,
    }
  }
  return ALLOW
}

/** Hosts that serve application forms, so their page text need not prove it. */
const ATS_HOSTS = [
  "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com", "myworkdaysite.com", "workday.com",
  "icims.com", "smartrecruiters.com", "jobvite.com", "bamboohr.com", "workable.com", "taleo.net",
  "successfactors.com", "teamtailor.com", "recruitee.com", "breezy.hr", "jazz.co", "applytojob.com",
  "rippling.com", "dover.com", "gem.com", "oraclecloud.com", "ultipro.com", "paylocity.com", "linkedin.com",
]

/** The kinds of field an application asks for. Real forms ask for several. */
const APPLICATION_FIELD_KINDS: RegExp[] = [
  /first[\s_-]?name|last[\s_-]?name|full[\s_-]?name|legal[\s_-]?name|given[\s_-]?name|family[\s_-]?name|surname/i,
  /e-?mail/i,
  /phone|mobile/i,
  /resume|résumé|curriculum vitae|\bcv\b|cover[\s_-]?letter|input-type-file/i,
  /linkedin/i,
]

/** Shown on the sign-in step in front of a form, which has no form fields yet. */
const SIGN_IN_STEP_RE = /sign in to apply|create (an )?account/i

/**
 * Is this page an application form at all?
 *
 * A careers site's job search has inputs too ("Search for a role", "Enter work
 * email"), and one can hide a stray file input, so a single match proves nothing.
 * It takes two different kinds of application field. `signalText` is the labels
 * and names of the page's fields across all frames, not its prose, since a job
 * listing can say "resume" anywhere. Null means it could not be read, which proves
 * nothing, and the result is deletion, so that must pass.
 */
export function isAtsHost(url: string): boolean {
  const host = hostOf(url)
  return !host.startsWith("api.") && !!hostMatches(host, ATS_HOSTS)
}

export function hasApplicationFields(signalText: string | null): boolean {
  if (!signalText) return false
  if (SIGN_IN_STEP_RE.test(signalText)) return true
  return APPLICATION_FIELD_KINDS.filter((kind) => kind.test(signalText)).length >= 2
}

export function evaluateApplicationPage(url: string, signalText: string | null): UnsafePageVerdict {
  const pass: UnsafePageVerdict = { blocked: false, kind: null, reason: null, signal: null }
  const host = hostOf(url)
  // An API endpoint on an ATS domain returns data, not a form.
  if (!host.startsWith("api.") && hostMatches(host, ATS_HOSTS)) return pass
  if (signalText === null || hasApplicationFields(signalText)) return pass
  return {
    blocked: true,
    kind: "not_application",
    reason: `Landed on a page that is not a job application: ${url}`,
    signal: "no-application-fields",
  }
}

const BOT_WALL_HOSTS = ["captcha-delivery.com", "challenges.cloudflare.com", "perimeterx.net", "hcaptcha.com", "recaptcha.net"]
const BOT_WALL_TEXT_RE = /verify (that )?you are (a )?human|checking your browser|press (&|and) hold|are you a robot|attention required|unusual traffic/i

/**
 * A bot check standing in front of the real page. It says nothing about the
 * posting, so it must never count as "not an application", which deletes the row.
 */
export function isBotWall(url: string, pageText: string): boolean {
  if (hostMatches(hostOf(url), BOT_WALL_HOSTS)) return true
  return (pageText || "").length < 2000 && BOT_WALL_TEXT_RE.test(pageText || "")
}

export const BOT_WALL_WAIT_MS = 45_000

/** DataDome marks a directly banned IP with t=bv. Only a different IP gets past it. */
export function isBannedBotWall(url: string): boolean {
  return /captcha-delivery\.com/i.test(url) && /[?&]t=bv\b/i.test(url)
}

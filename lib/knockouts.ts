/**
 * Knockout gating — the hard pass/fail screen a real ATS runs *before* any
 * keyword ranking, applied here *before* we spend a browser session.
 *
 * Every run costs a Kernel/Browserbase session, a proxy, and a handful of LLM
 * calls. Discovering after all that spend that the candidate needs sponsorship
 * and the posting says it won't sponsor is pure waste. These checks run on data
 * we already have in Postgres, so a doomed application never reaches dispatch.
 *
 * HONESTY RULE, borrowed from the same idea in Tsenta's knockouts.ts: a `fail`
 * is only ever raised from something the candidate or the posting *explicitly*
 * states. Anything we merely infer — a seniority gap, an onsite role outside the
 * candidate's cities — is a `warn`. Warns are surfaced to the operator but never
 * block dispatch on their own, because a wrongly-blocked application is a lost
 * job for a real person and is far more costly than a wasted session.
 *
 * Pure and dependency-free so it can be unit-tested without a database.
 */

import { normalizeExperienceLevel, EXPERIENCE_LEVELS, type ExperienceLevel } from "./job-parser"

export type KnockoutStatus = "pass" | "warn" | "fail"
export type KnockoutKey = "work_authorization" | "experience" | "location"

export interface Knockout {
  key: KnockoutKey
  label: string
  status: KnockoutStatus
  /** One-line, operator-facing explanation of the verdict. */
  detail: string
}

/** The candidate fields these checks read. A subset of LiveApplicationQueue. */
export interface KnockoutCandidate {
  work_authorization_status?: string | null
  location?: string | null
  preferred_cities?: string[] | null
  work_mode_preferences?: string[] | null
  experience?: Array<{ startDate?: string; endDate?: string | null; isCurrent?: boolean }> | null
}

/** The job fields these checks read. A subset of the `jobs` row. */
export interface KnockoutJob {
  work_authorization?: string | null
  /** One of EXPERIENCE_LEVELS, or free text we normalize. */
  experience?: string | null
  location?: string | null
  type?: string | null
  description?: string | null
  detailed_requirements?: string | null
}

// ─── Work authorization ───

/**
 * Postings that explicitly rule out sponsorship. Deliberately specific so a JD
 * that merely *mentions* sponsorship ("we offer visa sponsorship") never trips a
 * false disqualification — the negation has to be present.
 */
const NO_SPONSOR_PATTERNS: RegExp[] = [
  /\b(?:not?|unable to|cannot|can't|will not|won'?t|do(?:es)? not|are not able to|is not able to)\b[^.\n]{0,40}\bsponsor/i,
  /\bsponsorship\b[^.\n]{0,30}\b(?:is|are|will)?\s*not\s+(?:available|offered|provided|considered)/i,
  /\bno\b[^.\n]{0,20}\b(?:visa\s+)?sponsorship\b/i,
  /\bauthoriz(?:ed|ation)\s+to\s+work\b[^.\n]{0,60}\bwithout\b[^.\n]{0,20}\bsponsor/i,
]

/** Postings that explicitly *offer* sponsorship — checked first, so it wins. */
const WILL_SPONSOR_PATTERNS: RegExp[] = [
  /\b(?:visa\s+)?sponsorship\s+(?:is\s+)?(?:available|offered|provided)\b/i,
  /\bwe\s+(?:will|do|can)\s+sponsor\b/i,
  /\bh[\s-]?1b\s+(?:sponsorship|transfer)\b/i,
]

export type JobAuthPolicy = "will_sponsor" | "no_sponsorship" | "citizen_only" | "open" | "unknown"
export type CandidateAuthStatus = "citizen" | "authorized" | "needs_sponsorship" | "unknown"

/**
 * Classify the posting's sponsorship policy. Reads the structured
 * `work_authorization` column first (populated by job-parser's extractWorkAuth),
 * then falls back to scanning the description text.
 */
export function classifyJobAuth(job: KnockoutJob): JobAuthPolicy {
  const structured = (job.work_authorization || "").toLowerCase()
  if (structured) {
    if (structured.includes("will sponsor")) return "will_sponsor"
    if (structured.includes("open to all")) return "open"
    if (structured.includes("citizen") || structured.includes("green card")) return "citizen_only"
    if (structured.includes("no sponsorship")) return "no_sponsorship"
  }

  const text = `${job.description || ""} ${job.detailed_requirements || ""}`
  if (!text.trim()) return "unknown"
  // An explicit offer outranks a negation elsewhere in a long JD.
  if (WILL_SPONSOR_PATTERNS.some((re) => re.test(text))) return "will_sponsor"
  if (NO_SPONSOR_PATTERNS.some((re) => re.test(text))) return "no_sponsorship"
  return "unknown"
}

/** Classify the candidate's own stated authorization. */
export function classifyCandidateAuth(raw: string | null | undefined): CandidateAuthStatus {
  const s = (raw || "").toLowerCase().trim()
  if (!s) return "unknown"
  // Check the sponsorship need first: "authorized, but will need sponsorship in
  // future" must classify as needs_sponsorship, not authorized.
  if (/\b(?:need|require)s?\b[^.]{0,30}\bsponsor/.test(s)) return "needs_sponsorship"
  if (/\bh[\s-]?1b\b|\bf[\s-]?1\b|\bopt\b|\bcpt\b|\bstudent visa\b|\bvisa\s+required\b/.test(s)) {
    return "needs_sponsorship"
  }
  if (/\bcitizen\b|\bgreen\s?card\b|\bpermanent\s+resident\b|\bpr\b/.test(s)) return "citizen"
  if (/\bno\s+sponsorship\s+(?:needed|required)\b|\bauthoriz|\bead\b|\btn\s+visa\b/.test(s)) {
    return "authorized"
  }
  return "unknown"
}

function workAuthorization(c: KnockoutCandidate, job: KnockoutJob): Knockout | null {
  const cand = classifyCandidateAuth(c.work_authorization_status)
  const policy = classifyJobAuth(job)
  const k = (status: KnockoutStatus, detail: string): Knockout => ({
    key: "work_authorization",
    label: "Work authorization",
    status,
    detail,
  })

  // A citizen/PR clears every policy — nothing to gate on.
  if (cand === "citizen") return null

  if (cand === "needs_sponsorship") {
    if (policy === "no_sponsorship") {
      return k("fail", "The posting states it does not sponsor work visas, and this candidate needs sponsorship.")
    }
    if (policy === "citizen_only") {
      return k("fail", "The posting is restricted to citizens or green-card holders, and this candidate needs sponsorship.")
    }
    if (policy === "will_sponsor") return k("pass", "The posting offers visa sponsorship.")
    if (policy === "open") return k("pass", "The posting accepts all work-authorization statuses.")
    return k("warn", "Sponsorship isn't stated on this posting — confirm before relying on it.")
  }

  if (cand === "authorized" && policy === "citizen_only") {
    // Authorized-to-work is not the same as citizen/PR, but we can't tell from a
    // free-text status whether this specific candidate qualifies. Inferred → warn.
    return k("warn", "The posting is restricted to citizens or green-card holders; this candidate is authorized but may not qualify.")
  }

  if (cand === "unknown" && (policy === "no_sponsorship" || policy === "citizen_only")) {
    return k("warn", "This posting restricts work authorization, and the candidate's status isn't recorded.")
  }

  return null
}

// ─── Experience ───

/** Total years of professional experience implied by the candidate's history. */
export function totalYearsOfExperience(
  history: KnockoutCandidate["experience"],
  now: Date = new Date()
): number | null {
  if (!history?.length) return null
  let months = 0
  for (const role of history) {
    if (!role.startDate) continue
    const start = new Date(role.startDate)
    if (Number.isNaN(start.getTime())) continue
    const end = role.isCurrent || !role.endDate ? now : new Date(role.endDate)
    if (Number.isNaN(end.getTime())) continue
    const diff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
    if (diff > 0) months += diff
  }
  // Overlapping roles inflate this, but only ever in the candidate's favour —
  // and the check it feeds is a warn, so an optimistic estimate can't block.
  return months > 0 ? Math.round((months / 12) * 10) / 10 : null
}

/** Rough years-of-experience floor implied by a normalized seniority level. */
const LEVEL_MIN_YEARS: Record<ExperienceLevel, number> = {
  "Internship": 0,
  "Entry Level": 0,
  "Middle Level": 2,
  "Senior Level": 5,
  "Lead": 7,
  "Principal": 9,
  "Director": 10,
  "VP": 12,
  "C-Level": 15,
}

function experience(c: KnockoutCandidate, job: KnockoutJob): Knockout | null {
  if (!job.experience || job.experience === "Not specified") return null
  const required = normalizeExperienceLevel(job.experience)
  const years = totalYearsOfExperience(c.experience)
  if (years == null) return null

  const needed = LEVEL_MIN_YEARS[required]
  const gap = needed - years
  const k = (status: KnockoutStatus, detail: string): Knockout => ({
    key: "experience",
    label: "Experience",
    status,
    detail,
  })

  // Never a fail: the level is inferred from the posting and the years are
  // inferred from dates, so two inferences must not disqualify anyone.
  if (gap >= 3) {
    return k("warn", `Posting reads as ${required} (~${needed}+ yrs); this candidate has ~${years} yrs.`)
  }
  // Badly over-levelled candidates get screened out by real recruiters too.
  const seniorRoles: ExperienceLevel[] = ["Internship", "Entry Level"]
  if (seniorRoles.includes(required) && years >= 8) {
    return k("warn", `Posting is ${required} but this candidate has ~${years} yrs — likely to be screened out as over-qualified.`)
  }
  return k("pass", `~${years} yrs against a ${required} posting.`)
}

// ─── Location ───

const REMOTE_PATTERNS = /\b(remote|anywhere|work from home|wfh|distributed)\b/i
const ONSITE_PATTERNS = /\b(on[\s-]?site|in[\s-]?office|in[\s-]?person)\b/i

/** Normalize a place string to a comparable city token. */
function cityKey(s: string): string {
  return s
    .toLowerCase()
    .split(",")[0]
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function location(c: KnockoutCandidate, job: KnockoutJob): Knockout | null {
  const jobLoc = (job.location || "").trim()
  if (!jobLoc) return null

  const k = (status: KnockoutStatus, detail: string): Knockout => ({
    key: "location",
    label: "Location",
    status,
    detail,
  })

  if (REMOTE_PATTERNS.test(jobLoc)) return k("pass", `Remote role (${jobLoc}).`)

  const candidateCities = [c.location, ...(c.preferred_cities || [])]
    .filter((x): x is string => !!x && !!x.trim())
    .map(cityKey)
  if (!candidateCities.length) return null

  const jobCity = cityKey(jobLoc)
  if (!jobCity) return null

  const matches = candidateCities.some((city) => city === jobCity || city.includes(jobCity) || jobCity.includes(city))
  if (matches) return k("pass", `Candidate is in or open to ${jobLoc}.`)

  // Candidate is open to remote and the posting isn't explicitly onsite — a
  // hybrid posting listing an office city may still work out.
  const wantsRemote = (c.work_mode_preferences || []).some((m) => REMOTE_PATTERNS.test(m))
  if (wantsRemote && !ONSITE_PATTERNS.test(jobLoc)) return null

  return k("warn", `Role is in ${jobLoc}; candidate is in ${c.location || "an unrecorded location"} and hasn't listed it as preferred.`)
}

// ─── Public API ───

export interface KnockoutReport {
  checks: Knockout[]
  /** True when any check is a hard, explicitly-stated disqualifier. */
  blocked: boolean
  /** The failing checks — what the "Won't apply" card lists. */
  failures: Knockout[]
  warnings: Knockout[]
  /** One-line reason for the queue card, or null when nothing blocks. */
  blockReason: string | null
}

/**
 * Run every knockout for a candidate/job pair.
 *
 * `blocked` is true only when something explicitly stated disqualifies the
 * application. Callers should skip dispatch on `blocked` and merely surface
 * `warnings` — see the honesty rule at the top of this file.
 */
export function evaluateKnockouts(c: KnockoutCandidate, job: KnockoutJob): KnockoutReport {
  const checks = [workAuthorization(c, job), experience(c, job), location(c, job)].filter(
    (x): x is Knockout => x !== null
  )
  const failures = checks.filter((x) => x.status === "fail")
  const warnings = checks.filter((x) => x.status === "warn")
  return {
    checks,
    failures,
    warnings,
    blocked: failures.length > 0,
    blockReason: failures.length > 0 ? failures.map((f) => f.detail).join(" ") : null,
  }
}

/**
 * Pre-dispatch fill coverage — "how much of this form can we actually fill?"
 *
 * Today the answer only arrives *after* a run, buried in the audit log. That
 * makes dispatch a coin flip: an application missing a résumé or a phone number
 * will burn a full session and then stall at the submit gate on a field no
 * amount of AI can invent. This estimates coverage up front from data we already
 * hold, so a doomed-to-stall application can be fixed (or held) before dispatch.
 *
 * It is an *estimate*, deliberately. We don't know the real field list until the
 * page is open, so this scores the candidate's profile against the fields the
 * portal's forms are known to ask for. It answers "is this profile complete
 * enough to get through a typical <portal> form", which is the question that
 * actually predicts a stall.
 *
 * Pure and DB-free.
 */

/** A field a form is likely to require, and how to satisfy it from a profile. */
interface FieldSpec {
  key: string
  label: string
  /** Blocking fields stall the submit gate outright when missing. */
  blocking: boolean
  has: (p: CoverageProfile) => boolean
}

/** The candidate fields coverage reads. A subset of LiveApplicationQueue. */
export interface CoverageProfile {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  country_code?: string | null
  location?: string | null
  resume_url?: string | null
  linkedin_url?: string | null
  github_url?: string | null
  headline?: string | null
  bio?: string | null
  skills?: string[] | null
  experience?: unknown[] | null
  education?: unknown[] | null
  work_authorization_status?: string | null
  gender?: string | null
  ethnicity?: string | null
  veteran_status?: string | null
  disability_status?: string | null
  cover_letter?: string | null
  salary_min?: number | null
  salary_max?: number | null
}

const nonEmpty = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : v != null

/**
 * Fields essentially every ATS application form asks for. Résumé and the core
 * identity fields are blocking: the submit gate in kernel.ts refuses to click
 * Submit without them, so a run missing one is a guaranteed stall.
 */
const CORE_FIELDS: FieldSpec[] = [
  { key: "first_name", label: "First name", blocking: true, has: (p) => nonEmpty(p.first_name) },
  { key: "last_name", label: "Last name", blocking: true, has: (p) => nonEmpty(p.last_name) },
  { key: "email", label: "Email", blocking: true, has: (p) => nonEmpty(p.email) },
  { key: "phone", label: "Phone", blocking: true, has: (p) => nonEmpty(p.phone) },
  { key: "resume", label: "Résumé", blocking: true, has: (p) => nonEmpty(p.resume_url) },
  { key: "location", label: "Location", blocking: false, has: (p) => nonEmpty(p.location) },
  { key: "linkedin", label: "LinkedIn", blocking: false, has: (p) => nonEmpty(p.linkedin_url) },
  { key: "work_auth", label: "Work authorization", blocking: false, has: (p) => nonEmpty(p.work_authorization_status) },
  { key: "experience", label: "Work history", blocking: false, has: (p) => nonEmpty(p.experience) },
  { key: "education", label: "Education", blocking: false, has: (p) => nonEmpty(p.education) },
  { key: "skills", label: "Skills", blocking: false, has: (p) => nonEmpty(p.skills) },
]

/** EEO / self-ID fields. Optional on most forms, required on some US postings. */
const EEO_FIELDS: FieldSpec[] = [
  { key: "gender", label: "Gender", blocking: false, has: (p) => nonEmpty(p.gender) },
  { key: "ethnicity", label: "Ethnicity", blocking: false, has: (p) => nonEmpty(p.ethnicity) },
  { key: "veteran", label: "Veteran status", blocking: false, has: (p) => nonEmpty(p.veteran_status) },
  { key: "disability", label: "Disability status", blocking: false, has: (p) => nonEmpty(p.disability_status) },
]

const GITHUB: FieldSpec = { key: "github", label: "GitHub", blocking: false, has: (p) => nonEmpty(p.github_url) }
const COVER_LETTER: FieldSpec = { key: "cover_letter", label: "Cover letter", blocking: false, has: (p) => nonEmpty(p.cover_letter) }

/**
 * Extra fields each portal's forms commonly ask beyond the core set. Keeps the
 * estimate honest per portal rather than scoring every form against one list.
 */
const PORTAL_EXTRAS: Record<string, FieldSpec[]> = {
  Greenhouse: [...EEO_FIELDS, COVER_LETTER],
  Lever: [GITHUB, COVER_LETTER],
  Ashby: [GITHUB, ...EEO_FIELDS],
  Workday: [...EEO_FIELDS],
  iCIMS: [...EEO_FIELDS],
  SmartRecruiters: [COVER_LETTER],
  LinkedIn: [],
  BambooHR: [COVER_LETTER],
  Jobvite: [...EEO_FIELDS],
}

export interface CoverageReport {
  /** 0..100, share of expected fields the profile can satisfy. */
  percent: number
  filled: string[]
  missing: string[]
  /** Missing fields that will stall the submit gate — the actionable ones. */
  blockingMissing: string[]
  /** True when nothing blocking is missing, i.e. the run can reach Submit. */
  canReachSubmit: boolean
  totalFields: number
}

/**
 * Estimate how completely a profile can fill a given portal's application form.
 *
 * `canReachSubmit` is the decision-grade signal — `percent` is context. A
 * profile at 70% with nothing blocking missing will submit fine; one at 90% with
 * no résumé will not.
 */
export function estimateCoverage(
  profile: CoverageProfile,
  portalType: string | null | undefined
): CoverageReport {
  const fields = [...CORE_FIELDS, ...(PORTAL_EXTRAS[portalType || ""] || [])]
  // A portal can list a core field again in its extras; score each key once.
  const seen = new Set<string>()
  const unique = fields.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)))

  const filled: string[] = []
  const missing: string[] = []
  const blockingMissing: string[] = []

  for (const f of unique) {
    if (f.has(profile)) filled.push(f.label)
    else {
      missing.push(f.label)
      if (f.blocking) blockingMissing.push(f.label)
    }
  }

  return {
    percent: unique.length ? Math.round((filled.length / unique.length) * 100) : 0,
    filled,
    missing,
    blockingMissing,
    canReachSubmit: blockingMissing.length === 0,
    totalFields: unique.length,
  }
}

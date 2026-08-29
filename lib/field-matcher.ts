import { COUNTRIES } from "./phone-country"

/**
 * Language-independent field identification.
 *
 * Until now, deciding what value a field wants meant regex-matching its visible
 * label. That has two fatal problems:
 *
 *  1. **Label text mutates.** An open dropdown injects its option text into the
 *     surrounding container, so "How did you hear about this opportunity?" became
 *     "How did you hear about this opportunity? Internet Online LinkedIn Job board"
 *     between rounds — and every match keyed on it broke.
 *  2. **Labels are localized.** A German or French posting never matches an
 *     English regex, so those forms fill nothing.
 *
 * Element attributes don't have either problem. `id="phonenumber-nationalnumber"`
 * means the same thing on every locale of a form, and it doesn't change when a
 * dropdown opens. So identification reads `id` / `name` / `autocomplete` FIRST,
 * and falls back to label text only when the attributes say nothing.
 *
 * Pure and DOM-free: it takes a descriptor, not an element.
 */

/** What a field is asking for, independent of how it's phrased. */
export type FieldSemantic =
  | "first_name"
  | "last_name"
  | "full_name"
  | "preferred_name"
  | "email"
  | "phone"
  | "phone_national"
  | "phone_country"
  | "city"
  | "location"
  | "address"
  | "postal_code"
  | "country"
  | "state"
  | "linkedin"
  | "github"
  | "portfolio"
  | "company"
  | "job_title"
  | "school"
  | "degree"
  | "salary"
  | "start_date"
  | "notice_period"
  | "work_auth"
  | "sponsorship"
  | "gender"
  | "ethnicity"
  | "veteran"
  | "disability"
  | "referral_source"
  | "cover_letter"
  | "resume"
  | "consent"

/** The attributes we read off a control. Produced in the VM, consumed here. */
export interface FieldDescriptor {
  tag?: string | null
  type?: string | null
  role?: string | null
  id?: string | null
  name?: string | null
  autocomplete?: string | null
  placeholder?: string | null
  inputmode?: string | null
  ariaLabel?: string | null
  dataQa?: string | null
  className?: string | null
  /** Visible label — the LAST resort, because it mutates and is localized. */
  label?: string | null
}

/** How the semantic was determined — surfaced in logs so matches are auditable. */
export type MatchSource = "autocomplete" | "attribute" | "label" | "none"

export interface SemanticMatch {
  semantic: FieldSemantic
  source: MatchSource
  /** The attribute or pattern that produced the match. */
  evidence: string
}

/**
 * The HTML autocomplete spec is the single most reliable signal available: it's
 * standardized, machine-readable, and locale-independent. Checked before
 * anything else.
 */
const AUTOCOMPLETE_MAP: Record<string, FieldSemantic> = {
  "given-name": "first_name",
  "family-name": "last_name",
  name: "full_name",
  nickname: "preferred_name",
  email: "email",
  tel: "phone",
  "tel-national": "phone_national",
  "tel-country-code": "phone_country",
  "address-level2": "city",
  "address-level1": "state",
  "street-address": "address",
  "postal-code": "postal_code",
  country: "country",
  "country-name": "country",
  organization: "company",
  "organization-title": "job_title",
  url: "portfolio",
}

/**
 * id / name substring → semantic, most specific first. Order matters:
 * "phonenumber-nationalnumber" must beat the generic "phone", or a national
 * number field gets the full internationally-formatted number written into it.
 */
const ATTRIBUTE_PATTERNS: Array<{ re: RegExp; semantic: FieldSemantic }> = [
  // Phone — specific shapes before the generic one.
  { re: /phonenumber[-_]?nationalnumber|phone[-_]?national|nationalnumber/i, semantic: "phone_national" },
  { re: /phone[-_]?(country|prefix|code|dial)|countrycode|dialcode|iti__/i, semantic: "phone_country" },
  { re: /\b(phone|mobile|telephone|tel)\b|phonenumber/i, semantic: "phone" },

  // Name — first/last before the generic "name", which would swallow both.
  { re: /first[-_]?name|given[-_]?name|fname|legal[-_]?first/i, semantic: "first_name" },
  { re: /last[-_]?name|family[-_]?name|surname|lname|legal[-_]?last/i, semantic: "last_name" },
  { re: /preferred[-_]?name|nick[-_]?name|display[-_]?name/i, semantic: "preferred_name" },
  { re: /full[-_]?name|legal[-_]?name|^name$|candidate[-_]?name/i, semantic: "full_name" },

  { re: /e[-_]?mail/i, semantic: "email" },

  // Location — LinkedIn's geo-location id is the canonical example.
  { re: /geo[-_]?location|location[-_]?geo|geolocation/i, semantic: "city" },
  { re: /postal|zip[-_]?code|\bzip\b/i, semantic: "postal_code" },
  { re: /\bcity\b|address[-_]?level2/i, semantic: "city" },
  { re: /\bstate\b|province|region|address[-_]?level1/i, semantic: "state" },
  { re: /\bcountry\b/i, semantic: "country" },
  { re: /street|address[-_]?line|\baddress\b/i, semantic: "address" },
  { re: /\blocation\b|current[-_]?location|based[-_]?in/i, semantic: "location" },

  // Links.
  { re: /linked[-_]?in/i, semantic: "linkedin" },
  { re: /git[-_]?hub/i, semantic: "github" },
  { re: /portfolio|personal[-_]?(site|website)|\bwebsite\b|\bblog\b/i, semantic: "portfolio" },

  // Employment / education.
  { re: /current[-_]?(company|employer)|\bcompany\b|\bemployer\b|\borg\b/i, semantic: "company" },
  { re: /job[-_]?title|current[-_]?title|\btitle\b|\bheadline\b/i, semantic: "job_title" },
  { re: /school|university|college|institution|\balma\b/i, semantic: "school" },
  { re: /degree|qualification|education[-_]?level/i, semantic: "degree" },

  // Compensation / timing.
  { re: /salary|compensation|expected[-_]?pay|\bctc\b|desired[-_]?pay/i, semantic: "salary" },
  { re: /notice[-_]?period/i, semantic: "notice_period" },
  { re: /start[-_]?date|available[-_]?from|availability/i, semantic: "start_date" },

  // Eligibility.
  { re: /sponsor/i, semantic: "sponsorship" },
  { re: /work[-_]?auth|authoriz|right[-_]?to[-_]?work|eligib/i, semantic: "work_auth" },

  // Self-identification.
  { re: /gender|\bsex\b|pronoun/i, semantic: "gender" },
  { re: /ethnic|\brace\b|racial/i, semantic: "ethnicity" },
  { re: /veteran|military/i, semantic: "veteran" },
  { re: /disabilit|\bada\b/i, semantic: "disability" },

  // Misc.
  { re: /how[-_]?(did[-_]?you[-_]?)?hear|referral[-_]?source|\bsource\b|referred[-_]?by/i, semantic: "referral_source" },
  { re: /cover[-_]?letter/i, semantic: "cover_letter" },
  { re: /resume|\bcv\b|curriculum/i, semantic: "resume" },
  { re: /consent|agree|certif|acknowledg|terms|privacy/i, semantic: "consent" },
]

/**
 * Label-text patterns. Only consulted when attributes yield nothing, because
 * label text is both mutable and localized.
 */
const LABEL_PATTERNS: Array<{ re: RegExp; semantic: FieldSemantic }> = [
  { re: /how did you hear|hear about|where did you find/i, semantic: "referral_source" },
  { re: /where are you (located|based)|your location|current location/i, semantic: "location" },
  { re: /first name|given name/i, semantic: "first_name" },
  { re: /last name|surname|family name/i, semantic: "last_name" },
  { re: /preferred name|what should we call you/i, semantic: "preferred_name" },
  { re: /full name|legal name|^name$/i, semantic: "full_name" },
  { re: /e-?mail/i, semantic: "email" },
  { re: /phone|mobile|contact number/i, semantic: "phone" },
  { re: /linkedin/i, semantic: "linkedin" },
  { re: /github/i, semantic: "github" },
  { re: /portfolio|personal (site|website)|website/i, semantic: "portfolio" },
  { re: /sponsor/i, semantic: "sponsorship" },
  { re: /authoriz|right to work|eligible to work/i, semantic: "work_auth" },
  { re: /salary|compensation|expected pay/i, semantic: "salary" },
  { re: /when can you start|start date|available from/i, semantic: "start_date" },
  { re: /notice period/i, semantic: "notice_period" },
  { re: /gender|pronoun/i, semantic: "gender" },
  { re: /ethnic|race/i, semantic: "ethnicity" },
  { re: /veteran|military/i, semantic: "veteran" },
  { re: /disabilit/i, semantic: "disability" },
  { re: /cover letter/i, semantic: "cover_letter" },
  { re: /certify|i agree|i acknowledge|i consent|terms and conditions|privacy policy/i, semantic: "consent" },
]

/**
 * Identify what a field is asking for.
 *
 * Order — autocomplete → id/name/data-qa/aria-label/placeholder → label text —
 * is the whole point: the first two are stable and locale-independent, the last
 * is neither.
 */
export function identifyField(d: FieldDescriptor): SemanticMatch | null {
  // 1. The HTML autocomplete spec: standardized and unambiguous.
  const ac = (d.autocomplete || "").toLowerCase().trim()
  if (ac) {
    // "shipping tel" / "billing email" — the token we want is the last one.
    const token = ac.split(/\s+/).pop() || ac
    const semantic = AUTOCOMPLETE_MAP[token] ?? AUTOCOMPLETE_MAP[ac]
    if (semantic) return { semantic, source: "autocomplete", evidence: `autocomplete="${ac}"` }
  }

  // 2. Stable element attributes.
  const attrs: Array<[string, string]> = [
    ["id", d.id || ""],
    ["name", d.name || ""],
    ["data-qa", d.dataQa || ""],
    ["aria-label", d.ariaLabel || ""],
    ["placeholder", d.placeholder || ""],
  ]
  for (const { re, semantic } of ATTRIBUTE_PATTERNS) {
    for (const [attrName, attrValue] of attrs) {
      if (attrValue && re.test(attrValue)) {
        return { semantic, source: "attribute", evidence: `${attrName}="${attrValue.slice(0, 60)}"` }
      }
    }
  }

  // 3. Visible label, last.
  const label = (d.label || "").trim()
  if (label) {
    for (const { re, semantic } of LABEL_PATTERNS) {
      if (re.test(label)) {
        return { semantic, source: "label", evidence: `label="${label.slice(0, 60)}"` }
      }
    }
  }

  return null
}

/** The candidate fields {@link valueForSemantic} reads. */
export interface CandidateData {
  firstName?: string | null
  lastName?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  phoneNational?: string | null
  phoneCountryDial?: string | null
  location?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  postalCode?: string | null
  address?: string | null
  linkedinUrl?: string | null
  githubUrl?: string | null
  portfolioUrl?: string | null
  company?: string | null
  jobTitle?: string | null
  school?: string | null
  degree?: string | null
  salaryExpectation?: string | null
  startDate?: string | null
  noticePeriod?: string | null
  workAuthorization?: string | null
  needsSponsorship?: string | null
  gender?: string | null
  ethnicity?: string | null
  veteranStatus?: string | null
  disabilityStatus?: string | null
  referralSource?: string | null
  coverLetter?: string | null
}

const firstNonEmpty = (...vals: Array<string | null | undefined>): string =>
  vals.find((v) => typeof v === "string" && v.trim().length > 0)?.trim() ?? ""

/**
 * Remove the international dial code from a phone number.
 *
 * A greedy `/^\+\d{1,4}/` is WRONG: on "+919876543210" it eats "+9198" and
 * silently writes a mangled number onto a real application. Match against the
 * known dial codes, longest first, so "+91" wins over "+9" and "+353" is never
 * read as "+3".
 */
export function stripDialCode(
  phone: string | null | undefined,
  knownDial?: string | null
): string {
  const raw = String(phone ?? "").trim()
  if (!raw) return ""
  if (!raw.startsWith("+")) return raw

  const normalized = "+" + raw.slice(1).replace(/\D/g, "")

  // An explicitly known dial code is authoritative.
  const known = String(knownDial ?? "").trim()
  if (known) {
    const k = "+" + known.replace(/\D/g, "")
    if (k.length > 1 && normalized.startsWith(k)) return normalized.slice(k.length)
  }

  const byLength = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
  for (const c of byLength) {
    if (normalized.startsWith(c.dial)) return normalized.slice(c.dial.length)
  }
  // Unknown code: return the number unchanged rather than guessing a cut point.
  return raw
}

/**
 * The value to enter for a recognized semantic, or "" when the candidate has no
 * data for it. Never invents — an empty string means "we don't know", which the
 * caller must handle rather than paper over.
 */
export function valueForSemantic(semantic: FieldSemantic, c: CandidateData): string {
  switch (semantic) {
    case "first_name":
      return firstNonEmpty(c.firstName, c.name?.split(/\s+/)[0])
    case "last_name":
      return firstNonEmpty(c.lastName, c.name?.split(/\s+/).slice(1).join(" "))
    case "full_name":
      return firstNonEmpty(c.name, [c.firstName, c.lastName].filter(Boolean).join(" "))
    case "preferred_name":
      return firstNonEmpty(c.firstName, c.name?.split(/\s+/)[0])
    case "email":
      return firstNonEmpty(c.email)
    case "phone":
      return firstNonEmpty(c.phone)
    // A national-number input sits next to a country-code dropdown; writing the
    // full international number into it produces a doubled dial code.
    case "phone_national":
      return firstNonEmpty(c.phoneNational, stripDialCode(c.phone, c.phoneCountryDial))
    case "phone_country":
      return firstNonEmpty(c.phoneCountryDial)
    case "city":
      return firstNonEmpty(c.city, c.location?.split(",")[0])
    case "state":
      return firstNonEmpty(c.state, c.location?.split(",")[1])
    case "country":
      return firstNonEmpty(c.country, c.location?.split(",").pop())
    case "postal_code":
      return firstNonEmpty(c.postalCode)
    case "address":
      return firstNonEmpty(c.address, c.location)
    case "location":
      return firstNonEmpty(c.location, c.city)
    case "linkedin":
      return firstNonEmpty(c.linkedinUrl)
    case "github":
      return firstNonEmpty(c.githubUrl)
    case "portfolio":
      return firstNonEmpty(c.portfolioUrl, c.githubUrl)
    case "company":
      return firstNonEmpty(c.company)
    case "job_title":
      return firstNonEmpty(c.jobTitle)
    case "school":
      return firstNonEmpty(c.school)
    case "degree":
      return firstNonEmpty(c.degree)
    case "salary":
      return firstNonEmpty(c.salaryExpectation)
    case "start_date":
      return firstNonEmpty(c.startDate)
    case "notice_period":
      return firstNonEmpty(c.noticePeriod)
    case "work_auth":
      return firstNonEmpty(c.workAuthorization)
    case "sponsorship":
      return firstNonEmpty(c.needsSponsorship)
    case "gender":
      return firstNonEmpty(c.gender)
    case "ethnicity":
      return firstNonEmpty(c.ethnicity)
    case "veteran":
      return firstNonEmpty(c.veteranStatus)
    case "disability":
      return firstNonEmpty(c.disabilityStatus)
    case "referral_source":
      return firstNonEmpty(c.referralSource, "LinkedIn")
    case "cover_letter":
      return firstNonEmpty(c.coverLetter)
    // Consent is a boolean control, and résumé is a file upload — neither takes
    // a typed value, so they're handled by their own widget handlers.
    case "consent":
    case "resume":
      return ""
  }
}

/** Identify and resolve in one step. Returns null when unrecognized. */
export function resolveFieldValue(
  d: FieldDescriptor,
  c: CandidateData
): { semantic: FieldSemantic; value: string; source: MatchSource; evidence: string } | null {
  const match = identifyField(d)
  if (!match) return null
  return { ...match, value: valueForSemantic(match.semantic, c) }
}

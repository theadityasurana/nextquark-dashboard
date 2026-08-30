/**
 * Which answer strategy a field gets, and why.
 *
 * The bug this module exists to kill: a flat list of 36 loose regexes was run
 * against every control's label, in order, before anything else. `/relocat/`
 * turned "Describe a time you helped relocate a team" into "Yes". `/major/`
 * answered "What was your major accomplishment?" with "Computer Science".
 * `/pip/` matched any label containing those three letters. Those answers went
 * to real employers.
 *
 * Two changes fix the whole class:
 *
 *   1. SHAPE BEFORE TEXT. A pattern may only fire on a control whose widget can
 *      actually accept that kind of answer. "Are you willing to relocate?" is a
 *      Yes/No question *because the widget offers Yes and No* — not because the
 *      word "relocate" appeared. A textarea is never a Yes/No question, no
 *      matter what its label says.
 *
 *   2. ANCHORED PATTERNS. Every pattern is bounded with `\b`, and the risky ones
 *      additionally require the label to read like a question rather than merely
 *      to contain a keyword.
 *
 * Everything here is pure and DOM-free so the whole policy is testable as a
 * table, which is the only way to be confident about a rule set this size.
 */

import { isDateQuestion, isConsentQuestion, defaultStartDate, dateCandidates } from "./field-answers"
import { isSensitiveQuestion } from "./application-answers"

/** The shape of the control, as scanned or as declared by an ATS schema. */
export type WidgetShape =
  | "text"
  | "longtext"
  | "select"
  | "multiselect"
  | "radio"
  | "checkbox"
  | "typeahead"
  | "date"
  | "file"
  | "unknown"

export interface PolicyField {
  label: string
  kind: string
  required: boolean
  options: string[]
  /** Where the ATS schema says this question comes from, when we know. */
  schemaGroup?: string
  /** The control's stable key. Some providers encode the block in the name. */
  key?: string
}

/**
 * Field names that identify a diversity / EEO block by structure rather than by
 * wording.
 *
 * Surveyed across 21 live forms: Lever puts its self-identification survey under
 * `surveysResponses[<uuid>]` and its EEO block under `eeo[race]`, `eeo[gender]`,
 * `eeo[veteran]`, `eeo[disability]`. Greenhouse tags the same questions in its
 * schema, but Lever exposes no schema at all — so on Lever the NAME is the only
 * reliable signal, and matching on wording alone would miss a survey phrased in
 * an unusual way.
 */
const SURVEY_NAME_RE = /(^|[.:[])(surveysResponses|eeo|demographic|selfIdentification|voluntary_self_id)\b/i

/** How an answer for this field should be produced. */
export type AnswerRoute =
  /** Identity taken straight from the candidate profile. Never guessed. */
  | { route: "profile"; value: string; why: string }
  /** A fixed factual answer, safe because the widget shape agrees. */
  | { route: "deterministic"; value: string; why: string }
  /** Pick one of `options`; `value` is our preferred answer to match against. */
  | { route: "choice"; value: string; why: string }
  /** Tick or leave a consent/certification box. */
  | { route: "consent"; value: string; why: string }
  /** Must be written by the model. */
  | { route: "llm"; why: string }
  /** A human has to answer this one. Never auto-filled. */
  | { route: "sensitive"; why: string }
  /** Handled by a dedicated path (résumé upload), not the fill loop. */
  | { route: "file"; why: string }
  /** Nothing sensible to do. */
  | { route: "skip"; why: string }

// ─── Shape helpers ───

/** Normalise a scanned `kind` string onto the closed WidgetShape set. */
export function shapeOf(kind: string): WidgetShape {
  switch ((kind || "").toLowerCase()) {
    case "textarea":
    case "longtext":
      return "longtext"
    case "select":
      return "select"
    case "multiselect":
      return "multiselect"
    case "radio":
    // A row of <button>Yes</button> / <button>No</button> is a radio group that
    // happens to be built out of buttons. It answers like one, so it routes
    // like one — only the handler that drives it differs.
    case "buttongroup":
      return "radio"
    case "checkbox":
    case "consent":
      return "checkbox"
    case "typeahead":
      return "typeahead"
    case "date":
      return "date"
    case "file":
      return "file"
    case "text":
    case "email":
    case "phone":
    case "url":
    case "number":
      return "text"
    default:
      return "unknown"
  }
}

/** A control the user picks from rather than types into. */
function isChoiceShape(s: WidgetShape): boolean {
  return s === "select" || s === "multiselect" || s === "radio" || s === "typeahead"
}

/** A control that accepts free prose. */
function isProseShape(s: WidgetShape): boolean {
  return s === "longtext"
}

/**
 * The "nothing selected yet" row every dropdown carries.
 *
 * The previous test was `/^(select|choose|--|-)\b/`, whose `\b` can never match
 * after a dash — the next character is a space or another dash, and neither is a
 * word boundary from `-`. So "-- Select --" and "- Select -" were counted as
 * real options, which made a one-option acknowledgement dropdown look like a
 * two-option question and lose its consent route.
 */
export function isPlaceholderOption(option: string): boolean {
  const o = option.trim()
  if (!o) return true
  if (/^[-–—_.\s]+$/.test(o)) return true
  return /^[-–—\s]*(please\s+)?(select|choose|pick|--)\b/i.test(o)
}

const AFFIRMATIVE = /^(yes|y|true|i am|i do|i have|i agree|affirm|confirmed?)\b/i

/** An option that reads as "I accept", rather than as an answer to a question. */
const AFFIRMATIVE_OPTION =
  /^(acknowledge|confirm|agree|accept|i\s+(acknowledge|confirm|agree|accept|understand|have\s+read|have\s+reviewed))\b/i

/**
 * Do these options offer agreement rather than an answer?
 *
 * A single option is the clearest signal — a one-item "dropdown" exists only to
 * be ticked. Otherwise every option must read as an acceptance, which a Yes/No
 * pair never does.
 */
export function isAcknowledgementOptions(options: string[]): boolean {
  const real = options.map((o) => o.trim()).filter((o) => o && !isPlaceholderOption(o))
  if (real.length === 0) return false
  if (real.some((o) => NEGATIVE.test(o))) return false
  if (real.length === 1) return true
  return real.every((o) => AFFIRMATIVE_OPTION.test(o))
}

/**
 * A question that only applies when some earlier option was chosen.
 *
 * Recognised by its leading conditional, which is how every ATS phrases them:
 *   If selected "Events", please specify.
 *   If "Other", please specify.
 *   If selected "Referral", who referred you?
 *   If yes, please provide the name
 */
export function isConditionalFollowUp(label: string): boolean {
  return /^\s*(if\s+(you\s+)?(selected|chose|answered|applicable|yes|no|other)\b|if\s*["\u201c\u2018']|if\s+\w+\s*,\s*please\b)/i.test(
    label.trim()
  )
}
const NEGATIVE = /^(no|n|false|i am not|i do not|i don'?t|i have not|decline)\b/i

/**
 * Does this control offer a yes/no decision?
 *
 * The gate for the entire boolean bank. Deliberately strict: a two-option list
 * only counts when the options genuinely read as yes and no, so a
 * "Full-time / Part-time" pair can never absorb a Yes answer.
 */
export function isBooleanChoice(options: string[]): boolean {
  const real = options.map((o) => o.trim()).filter((o) => o && !isPlaceholderOption(o))
  if (real.length < 2 || real.length > 3) return false
  const yes = real.some((o) => AFFIRMATIVE.test(o))
  const no = real.some((o) => NEGATIVE.test(o))
  return yes && no
}

/**
 * A label that is asking for an explanation, not a fact.
 *
 * Checked before the fact banks so an essay prompt can never be answered from a
 * lookup table even when it happens to contain a bank keyword.
 */
export function looksLikeEssay(label: string): boolean {
  const l = label.trim()
  if (l.length > 140) return true
  return /\b(describe|explain|tell us|walk us through|why (do|are|would|should)|what (makes|motivates|interests|excites)|in your own words|share (an?|your)|give (an?|us) example|elaborate|cover letter|how would you|what would you)\b/i.test(
    l
  )
}

// ─── Identity fields ───
//
// These come from the candidate profile and from nowhere else. They are matched
// with tight anchors and are only ever applied to a control that can hold a
// short string, which is what stops a phone number being typed into a textarea
// that merely mentions the word "phone".

interface IdentityRule {
  id: string
  re: RegExp
  get: (u: any) => string
  /** Shapes this identity may be written into. */
  shapes: WidgetShape[]
}

const IDENTITY: IdentityRule[] = [
  {
    id: "firstName",
    re: /^(?:\*\s*)?(first[\s_-]*name|given[\s_-]*name|forename)\b/i,
    get: (u) => u.firstName || (u.name || "").split(/\s+/)[0] || "",
    shapes: ["text", "unknown"],
  },
  {
    id: "lastName",
    re: /^(?:\*\s*)?(last[\s_-]*name|surname|family[\s_-]*name)\b/i,
    get: (u) => u.lastName || (u.name || "").split(/\s+/).slice(1).join(" ") || "",
    shapes: ["text", "unknown"],
  },
  {
    id: "fullName",
    re: /^(?:\*\s*)?(full[\s_-]*name|legal[\s_-]*name|your[\s_-]*name|name)\s*\*?$/i,
    get: (u) => u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
    shapes: ["text", "unknown"],
  },
  {
    id: "email",
    re: /\b(e-?mail(\s*address)?)\b/i,
    get: (u) => u.email || "",
    shapes: ["text", "unknown"],
  },
  {
    id: "phone",
    re: /\b(phone|mobile|cell(\s*phone)?|contact\s*number|telephone)\b/i,
    get: (u) => u.phone || "",
    shapes: ["text", "unknown"],
  },
  {
    id: "linkedin",
    re: /\blinked\s*-?\s*in\b/i,
    get: (u) => u.linkedinUrl || "",
    shapes: ["text", "unknown"],
  },
  {
    id: "github",
    re: /\bgit\s*-?\s*hub\b/i,
    get: (u) => u.githubUrl || "",
    shapes: ["text", "unknown"],
  },
  {
    id: "portfolio",
    re: /\b(portfolio|personal\s*(web)?site|personal\s*url|website\s*url|your\s*website)\b/i,
    get: (u) => u.portfolioUrl || u.githubUrl || "",
    shapes: ["text", "unknown"],
  },
  {
    id: "currentCompany",
    re: /\b(current|present|most recent)\s+(employer|company|organi[sz]ation)\b|^(?:\*\s*)?(company|employer|organi[sz]ation)\s*\*?$/i,
    get: (u) => u.currentCompany || u.currentEmployer || "",
    shapes: ["text", "unknown"],
  },
  {
    id: "currentTitle",
    re: /\b(current|present|most recent)\s+(job\s*)?title\b|^(?:\*\s*)?(job\s*)?title\s*\*?$/i,
    get: (u) => u.currentTitle || u.jobTitle || "",
    shapes: ["text", "unknown"],
  },
  {
    id: "location",
    // The adverb slot is not optional in practice: "Where are you CURRENTLY
    // located?" is Ashby's stock wording and appeared on 6 of 8 surveyed
    // Ashby forms, and it missed without it.
    re: /\b(current\s+location|your\s+location|city|where\s+(are\s+you\s+(\w+\s+)?(located|based)|do\s+you\s+(\w+\s+)?live)|what\s+city\s+do\s+you\s+live)\b|^(?:\*\s*)?location\s*\*?$/i,
    get: (u) => u.location || "",
    // A location field is very often a typeahead (Greenhouse, Lever, LinkedIn).
    shapes: ["text", "typeahead", "unknown"],
  },
  {
    id: "twitter",
    re: /\b(twitter|x\.com)\b/i,
    get: (u) => u.twitterUrl || "",
    shapes: ["text", "unknown"],
  },
  {
    // Deliberately last of the URL rules: bare "Website" is the weakest signal
    // and must not out-rank LinkedIn / GitHub / Twitter above it.
    id: "website",
    re: /^(?:\*\s*)?(web\s*site|url)\s*\*?$/i,
    get: (u) => u.portfolioUrl || u.githubUrl || "",
    shapes: ["text", "unknown"],
  },
  {
    // "Home Address", "Please enter your full address including city, state,
    // country and postal code." Answered from the profile, never composed: an
    // invented street address is a fabricated fact about a real person. When the
    // profile only holds a city we fill the city — partial and true beats
    // complete and false.
    id: "address",
    re: /\b(home|residential|postal|mailing|street|full)\s+address\b|^(?:\*\s*)?address\s*\*?$|\bprimary\s+residence\b/i,
    get: (u) => u.address || u.homeAddress || u.streetAddress || u.location || "",
    shapes: ["text", "longtext", "typeahead", "unknown"],
  },
  {
    id: "country",
    // ── Why the negative lookahead ──
    // "Your authorization to work in the country where you live" contains
    // "country where you live", so this rule used to claim it and answer
    // "India" — into a dropdown whose only options describe work-permit
    // status. The country question and the work-authorization question share
    // vocabulary; only the absence of authorization words separates them.
    // No trailing \b on the stems: "authoriz" is followed by "ation", which is a
    // word character, so a boundary there can never match — which is exactly how
    // "Your authorization to work in the country where you live" slipped through
    // and got answered "India" into a work-permit dropdown.
    re: /^(?:\*\s*)?country\s*\*?$|^(?!.*(authori[sz]|work\s+permit|visa|sponsor|eligib|permit\s+to\s+work)).*\bcountry\s+(of\s+)?(residence|(where\s+|that\s+|in\s+which\s+)?you\s+(currently\s+)?(reside|live|are\s+(currently\s+)?based|are\s+located))\b/i,
    get: (u) => u.country || countryFromLocation(u.location) || "India",
    shapes: ["select", "typeahead", "radio", "text", "unknown"],
  },
]

function countryFromLocation(location?: string | null): string {
  const l = String(location || "")
  if (!l) return ""
  const m = l.split(",").pop()?.trim()
  return m && m.length > 2 ? m : ""
}

// ─── Yes / No facts ───
//
// Only ever consulted when `isBooleanChoice(options)` is true, or the widget is
// a checkbox. That single gate is what makes these patterns safe: they no longer
// have to be precise enough to survive contact with an essay prompt, because an
// essay prompt can never reach them.

const BOOLEAN_BANK: Array<{ id: string; re: RegExp; answer: (u: any) => string }> = [
  {
    // ── Sponsorship is tested BEFORE work authorisation, deliberately ──
    //
    // The two questions share almost all their vocabulary and have OPPOSITE
    // answers. Zscaler asks "Do you require a work permit, visa or additional
    // right to work support…?" — which contains "right to work", so the
    // authorisation rule claimed it and answered "Yes", telling the employer the
    // candidate needs sponsorship they do not need. What separates them is the
    // verb: needing something is a sponsorship question, having something is an
    // authorisation question.
    id: "sponsorship",
    re: /\b(sponsor(ship)?|visa\s+support)\b|\b(require|need|request)\b[^?]{0,60}\b(visa|work\s+permit|sponsor\w*|right\s+to\s+work\s+support|immigration)\b/i,
    answer: () => "No",
  },
  {
    id: "work_auth",
    re: /\b(legally\s+authori[sz]ed|authori[sz]ed\s+to\s+work|eligible\s+to\s+work|legal\s+right\s+to\s+work|right\s+to\s+work|work\s+authori[sz]ation)\b/i,
    answer: () => "Yes",
  },
  { id: "relocate", re: /\b(willing|open|able|prepared)\s+to\s+relocate\b|\brelocation\s+(required|possible)\b/i, answer: () => "Yes" },
  { id: "remote", re: /\b(work\s+remotely|remote\s+work|work\s+from\s+home)\b/i, answer: () => "Yes" },
  {
    // Office-attendance knockouts, in the wordings actually observed:
    //   "Are you able to work from our US office three days per week?"      (OpenAI)
    //   "Are you able to come into the office four days per week?"          (Perplexity)
    //   "We work from our offices on Mondays, Tuesdays and Thursdays…"      (Notion)
    //   "…work from our London office on a hybrid schedule, 3 days a week"  (Vercel)
    //   "Are you open to being on-site in our San Francisco office?"        (Cartesia)
    //   "In office attendance is an essential function for this role…"      (Snowflake)
    id: "onsite",
    re: /\b(work(ing)?\s+(from|at|out\s+of)\s+(our|the)\b[^?]{0,30}\boffices?|come\s+(in)?to\s+(our|the)\s+office|in[-\s]?office\s+attendance|on-?site|in-?person|hybrid\s+(schedule|model|work)|commute)\b/i,
    answer: () => "Yes",
  },
  { id: "travel", re: /\b(willing|able|open)\s+to\s+travel\b/i, answer: () => "Yes" },
  { id: "age18", re: /\b(at\s+least|over|older\s+than)\s+18\b|\b18\s+years\s+(of\s+age|or\s+older)\b|\blegal\s+working\s+age\b/i, answer: () => "Yes" },
  {
    // Every phrasing seen in the survey, including Zscaler's three-way
    // "Yes, I currently… / Yes, I previously… / No, I have never worked for X".
    // The bare "No" resolves against those because option matching compares the
    // leading token.
    id: "worked_here",
    re: /\b(worked|work|employed|intern(ed)?)\b[^?]{0,60}\b(here|for\s+us|at\s+(this|our)\s+compan)|\b(currently\s+work|previously\s+worked|ever\s+worked|been\s+employed)\s+(for|at|with)\b/i,
    answer: () => "No",
  },
  {
    // Conflict-of-interest screening for public-sector procurement. Asked by
    // every vendor that sells to government, and a wrong "Yes" is disqualifying.
    id: "government_conflict",
    re: /\b(procurement|contract\s+award|conflict\s+of\s+interest)\b[^?]{0,80}\b(government|public\s+(sector|official))|\b(are|were)\s+you\s+a\s+(current\s+or\s+former\s+)?government\s+(employee|official)\b|\bpublic\s+official\b/i,
    answer: () => "No",
  },
  { id: "noncompete", re: /\b(non-?compete|non-?disclosure|restrictive\s+covenant)\b/i, answer: () => "No" },
  { id: "pip", re: /\b(performance\s+improvement\s+plan|\bpip\b)\b/i, answer: () => "No" },
  { id: "terminated", re: /\b(terminated|dismissed|involuntar\w*\s+separat\w*|asked\s+to\s+resign)\b/i, answer: () => "No" },
  { id: "drug_test", re: /\b(drug\s+(test|screen)\w*)\b/i, answer: () => "Yes" },
  { id: "driver_licence", re: /\b(driver'?s?\s+licen[cs]e|valid\s+licen[cs]e\s+to\s+drive)\b/i, answer: () => "Yes" },
  { id: "passport", re: /\b(valid\s+passport|hold\s+a\s+passport)\b/i, answer: () => "Yes" },
  { id: "degree", re: /\b(have|hold|completed|obtained)\b[^?]{0,25}\b(degree|bachelor|diploma)\b/i, answer: () => "Yes" },
  { id: "fulltime", re: /\b(full-?time)\b[^?]{0,30}\b(position|role|opportunit|employment|basis)\b/i, answer: () => "Yes" },
  { id: "currently_employed", re: /\b(currently|presently)\s+(employed|working)\b/i, answer: () => "Yes" },
  {
    // "Are you a current employee at KnowBe4?" — asked by most large boards, and
    // distinct from `worked_here` (past) and `currently_employed` (anywhere).
    id: "current_employee_here",
    re: /\b(are|were)\s+you\s+(a\s+)?(current|former|previous)\s+(employee|contractor|intern|worker)\b|\bcurrently\s+(an?\s+)?(employee|contractor)\s+(at|of|with)\b/i,
    answer: () => "No",
  },
  {
    // Sanctions / embargo screening. Every US employer asks some version, and a
    // wrong "Yes" here is an automatic rejection.
    id: "sanctioned_country",
    re: /\b(cuba|iran|north\s+korea|syria|crimea|donetsk|luhansk|kherson|zaporizhzhia)\b|\b(embargo|sanction(ed|s)?)\b/i,
    answer: () => "No",
  },
  {
    // Export-control / restricted-party questions, same shape.
    id: "restricted_party",
    re: /\b(denied|restricted|debarred)\s+part(y|ies)\b|\bexport\s+control\b/i,
    answer: () => "No",
  },
]

// ─── Short factual answers ───
//
// Free-text or dropdown facts that come from the profile. Gated to short-answer
// shapes and blocked outright on anything that reads like an essay prompt.

const FACT_BANK: Array<{
  id: string
  re: RegExp
  answer: (u: any) => string
  shapes: WidgetShape[]
}> = [
  {
    // ── Research sources, which is NOT the referral-source question ──
    //
    // Greenhouse forms routinely ask both, and they look almost identical: two
    // multi-selects of social networks and job boards, one after the other.
    // They are different questions. "How did you learn about us?" asks how the
    // posting was found; "which of these have you used to research us?" asks
    // what the candidate read beforehand — and its option list deliberately
    // omits LinkedIn, so the referral answer has nothing to match against and
    // the whole question fell through to the model, which ticked a different
    // box on every retry.
    //
    // Matched on the research verb rather than the "how well do you know us"
    // wording, which is one employer's phrasing rather than a general shape.
    id: "research_sources",
    re: /\b(research(ed|ing)?|learn\s+more\s+about|find\s+out\s+more|read\s+about)\b[^?]{0,40}\b(us|our\s+compan|this\s+compan)\b|\bsources?\s*\/?\s*tools?\b[^?]{0,40}\b(used|research)\b/i,
    answer: () => "Twitter",
    shapes: ["select", "multiselect", "radio", "checkbox", "typeahead", "unknown"],
  },
  {
    id: "referral_source",
    // The optional adverb slot matters: "Where did you FIRST hear about this
    // role?" is the exact phrasing Greenhouse ships, and it missed without it.
    re: /\b((how|where)\s+did\s+you\s+(\w+\s+)?(hear|find|find\s+out|learn|see)|referral\s+source|source\s+of\s+(this\s+)?(job|application)|how\s+do\s+you\s+know\s+about)\b/i,
    answer: () => "LinkedIn",
    // multiselect included deliberately: "How did you learn about us? Select ALL
    // that apply." is a multi-select on Greenhouse, and leaving it out sent the
    // question to the model, which chose a different option on each retry.
    shapes: ["select", "multiselect", "radio", "typeahead", "text", "unknown"],
  },
  {
    id: "years_experience",
    re: /\b(years?\s+of\s+(relevant\s+|professional\s+|total\s+)?experience|how\s+many\s+years)\b/i,
    answer: (u) => (u.yearsOfExperience ? String(u.yearsOfExperience) : "5"),
    shapes: ["select", "radio", "text", "unknown"],
  },
  {
    id: "notice_period",
    re: /\b(notice\s+period|how\s+soon\s+can\s+you\s+(join|start)|serving\s+notice)\b/i,
    answer: (u) => u.noticePeriod || "30 days",
    shapes: ["select", "radio", "text", "unknown"],
  },
  {
    id: "expected_salary",
    re: /\b(expected|desired|target)\s+(salary|compensation|ctc|pay|remuneration)\b|\bsalary\s+expectation/i,
    answer: (u) => (u.salaryMin ? `${u.salaryCurrency || "INR"} ${u.salaryMin}` : "Open to discussion"),
    shapes: ["text", "select", "unknown"],
  },
  {
    id: "currency",
    re: /^(?:\*\s*)?currency\s*\*?$|\b(preferred|salary)\s+currency\b/i,
    answer: (u) => u.salaryCurrency || "INR",
    shapes: ["select", "radio", "typeahead", "text", "unknown"],
  },
  {
    id: "education_level",
    re: /\b(highest\s+(level\s+of\s+)?(education|degree|qualification)|education\s+level|degree\s+level)\b/i,
    answer: (u) => u.educationLevel || "Bachelor's Degree",
    shapes: ["select", "radio", "typeahead", "unknown"],
  },
  {
    id: "field_of_study",
    re: /\b(field\s+of\s+study|area\s+of\s+study|discipline|what\s+(was|is)\s+your\s+major)\b/i,
    answer: (u) => u.fieldOfStudy || "Computer Science",
    shapes: ["select", "radio", "typeahead", "text", "unknown"],
  },
  {
    id: "school",
    re: /\b(school|university|college|institution)\b/i,
    answer: (u) => u.school || u.university || "",
    shapes: ["select", "typeahead", "text", "unknown"],
  },
  {
    id: "employment_type",
    re: /\b(employment|position|job|work)\s+type\b|\btype\s+of\s+employment\b/i,
    answer: () => "Full-time",
    shapes: ["select", "radio", "unknown"],
  },
  {
    id: "languages",
    re: /\b(languages?\s+(you\s+)?(spoken|speak|know)|which\s+languages)\b/i,
    answer: (u) => u.languages || "English, Hindi",
    shapes: ["select", "multiselect", "text", "unknown"],
  },
  {
    id: "nationality",
    re: /\bnationality\b/i,
    answer: (u) => u.nationality || "Indian",
    shapes: ["select", "typeahead", "radio", "text", "unknown"],
  },
  {
    id: "pronouns",
    re: /\bpronouns?\b/i,
    answer: (u) => u.pronouns || "",
    shapes: ["select", "radio", "checkbox", "text", "multiselect", "unknown"],
  },
]

/**
 * Demographic and EEO questions.
 *
 * These are never *guessed*. But the candidate has already told us their own
 * gender, ethnicity, veteran and disability status in their profile, and
 * repeating a value they supplied themselves is not a guess — it is the answer
 * they gave. Withholding it also has a cost: several boards mark self-ID
 * questions REQUIRED, and leaving one blank blocks the whole application.
 *
 * The ordering is what keeps this honest:
 *   1. the candidate's own stated value, if the form offers a matching option
 *   2. an explicit decline-to-answer option, which every compliant form has
 *   3. otherwise leave it for a person
 *
 * A demographic value is never invented and never chosen by a model.
 */
function demographicRoute(field: PolicyField, userData: any): AnswerRoute {
  const l = field.label.toLowerCase()
  const stated =
    /\b(sex|gender)\b/.test(l) ? userData.gender :
    /\b(race|ethnic)\w*\b/.test(l) ? userData.ethnicity :
    /\bveteran\b|\bmilitary\b/.test(l) ? userData.veteranStatus :
    /\bdisab\w*\b/.test(l) ? userData.disabilityStatus :
    /\bpronoun/.test(l) ? userData.pronouns :
    null

  const options = field.options.filter((o) => o.trim() && !isPlaceholderOption(o))
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

  if (stated) {
    const want = norm(String(stated))
    const hit = options.find((o) => {
      const n = norm(o)
      return n === want || n.startsWith(want) || want.startsWith(n)
    })
    // With no option list to check against (a free-text or unscanned control)
    // the stated value still stands on its own.
    if (hit || options.length === 0) {
      return { route: "choice", value: hit ?? String(stated), why: "the candidate's own stated value" }
    }
  }

  const decline = options.find((o) =>
    /^(i )?(do not|don'?t)\s+(want|wish)\s+to\s+(answer|disclose|self)|^decline|^prefer\s+not|^choose\s+not|^not\s+(specified|disclosed)/i.test(o.trim())
  )
  if (decline) {
    return { route: "choice", value: decline, why: "declining to disclose — the profile has no stated value" }
  }

  return { route: "sensitive", why: `${field.schemaGroup ?? "demographic"} question — left for the candidate` }
}

/**
 * Route one field.
 *
 * Order is the safety property, and it runs strictest-first:
 *   file → sensitive/EEO → consent → essay → identity → date
 *        → boolean (shape-gated) → fact (shape-gated) → llm
 *
 * The essay check sits ABOVE every bank on purpose. A prompt asking the
 * candidate to explain something must reach the model even when it contains a
 * bank keyword, because a canned "Yes" in a free-text box is both wrong and
 * obviously machine-written to whoever reads it.
 */
export function routeField(field: PolicyField, userData: any): AnswerRoute {
  const label = (field.label || "").replace(/[*✱＊]+/g, " ").replace(/\s+/g, " ").trim()
  const shape = shapeOf(field.kind)

  if (shape === "file") return { route: "file", why: "handled by the résumé upload path" }
  if (!label) return { route: "skip", why: "no label to answer against" }

  // EEO and demographic questions are declined as a matter of policy, not
  // capability. The schema tells us plainly when we are in one of those blocks.
  if (field.schemaGroup === "eeo" || field.schemaGroup === "demographic") {
    return demographicRoute(field, userData)
  }
  if (field.key && SURVEY_NAME_RE.test(field.key)) {
    return { route: "sensitive", why: "part of a diversity / EEO survey block — left for the candidate" }
  }
  if (isSensitiveQuestion(label)) {
    return { route: "sensitive", why: "sensitive question — needs an explicit human answer" }
  }

  // Consent / certification boxes. Checked before the essay test because their
  // labels are frequently long legal paragraphs.
  if (shape === "checkbox" && isConsentQuestion(label)) {
    return { route: "consent", value: "Yes", why: "consent checkbox" }
  }

  // ── Conditional follow-ups, checked before ANY answering route ──
  //
  // "If selected \"Other\", please specify." / "If yes, please explain."
  // These only apply when their trigger option was actually chosen. This check
  // used to sit below the prose and essay gates, which meant a follow-up on a
  // textarea was claimed as an essay and handed to the model FIRST — so the
  // model invented an explanation for a trigger nobody selected, which is the
  // precise harm the check exists to prevent.
  if (isConditionalFollowUp(label)) {
    return {
      route: "skip",
      why: "conditional follow-up — only applies if its trigger option was selected",
    }
  }

  // Identity, before essays: "Tell us your LinkedIn" is still just the URL.
  for (const rule of IDENTITY) {
    if (!rule.re.test(label)) continue
    if (!rule.shapes.includes(shape)) continue
    const value = rule.get(userData)
    if (!value) {
      return {
        route: "skip",
        why: `profile has no ${rule.id} to fill "${label.slice(0, 40)}"`,
      }
    }
    return isChoiceShape(shape)
      ? { route: "choice", value, why: `profile.${rule.id}` }
      : { route: "profile", value, why: `profile.${rule.id}` }
  }

  // ── Résumé / cover-letter text boxes ──
  // The "or paste it instead" alternative to the file upload. The file is
  // already attached by the dedicated résumé path, so writing a model-authored
  // CV into the paste box would send the employer a second, invented one.
  if (isProseShape(shape) && /\b(resume|cv|curriculum vitae)\b/i.test(label)) {
    return { route: "skip", why: "résumé paste box — the real file is attached separately" }
  }

  // ── The essay gate applies ONLY to controls you type prose into ──
  //
  // It used to run before the shape was considered, so a 200-character
  // Greenhouse dropdown label ("Do you live in one of the following states?
  // Alabama, Alaska, Delaware…") tripped the length test and was routed to the
  // model, which then wrote a sentence into a Yes/No <select>. A control you
  // pick from is never an essay, however long its label is.
  if (isProseShape(shape)) {
    return { route: "llm", why: "free-text question — must be written, not looked up" }
  }
  if ((shape === "text" || shape === "unknown") && looksLikeEssay(label)) {
    return { route: "llm", why: "free-text question — must be written, not looked up" }
  }

  // ── Dates, but only into something that can hold one ──
  //
  // `isDateQuestion` matches a bare "date", and this branch had no shape gate —
  // the single rule in the module that ignored its own SHAPE-BEFORE-TEXT thesis.
  // Two real failures came out of it: a Yes/No "Is your start date flexible?"
  // was answered with a pipe-joined list of date formats instead of Yes, and a
  // plain text "Earliest start date" had the literal string
  // "12/09/2026|2026-12-09|09/12/2026" typed into it.
  //
  // A choice control asking about a date is a question about a date, not a date
  // field; it falls through to the banks and then to the model, which pick from
  // the options actually offered.
  if (shape === "date" || ((shape === "text" || shape === "unknown") && isDateQuestion(label))) {
    return { route: "deterministic", value: dateCandidates(defaultStartDate(userData)), why: "date question" }
  }

  // ── Yes/No bank — when the widget CAN offer a yes/no decision ──
  //
  // The strict reading of SHAPE-BEFORE-TEXT was "the options must literally say
  // Yes and No". That works on Greenhouse and Ashby, which publish an authoritative
  // schema, and silently disables this entire bank everywhere else: Lever, Workday,
  // SmartRecruiters, Workable, iCIMS and Jobvite expose no schema, so a closed
  // dropdown scans with ZERO options and `isBooleanChoice([])` is false.
  //
  // The cost of that was not one question. It was work authorisation, sponsorship,
  // on-site attendance, sanctions, non-competes and criminal history all falling
  // through to "unmapped choice" with an empty value on six of the nine portals —
  // which is how a real application came back with "Missing entry for required
  // field: Are you authorized to work in the country where the job is located?"
  //
  // An empty option list is ABSENCE of evidence, not evidence of absence. When the
  // DOM has already told us the control is a choice, proposing "Yes" costs nothing
  // that "" doesn't: the handler opens the widget, reads the options that actually
  // render, and matches the proposed value against them. If it does not match, the
  // field escalates exactly as it would have anyway.
  //
  // The thesis still holds where it earns its keep. Prose shapes and essay-shaped
  // labels have already been routed to the model above, so no textarea can reach
  // here; and when options ARE known they must still genuinely read as yes/no, so
  // a "Full-time / Part-time" pair can never absorb a "Yes".
  const optionsUnknown = field.options.length === 0
  const booleanCapable =
    shape === "checkbox" || isBooleanChoice(field.options) || (isChoiceShape(shape) && optionsUnknown)
  if (booleanCapable) {
    for (const rule of BOOLEAN_BANK) {
      if (rule.re.test(label)) {
        return { route: "choice", value: rule.answer(userData), why: `boolean bank: ${rule.id}` }
      }
    }
  }

  // Short factual answers, gated on shape.
  for (const rule of FACT_BANK) {
    if (!rule.re.test(label)) continue
    if (!rule.shapes.includes(shape)) continue
    const value = rule.answer(userData)
    if (!value) continue
    return isChoiceShape(shape)
      ? { route: "choice", value, why: `fact bank: ${rule.id}` }
      : { route: "deterministic", value, why: `fact bank: ${rule.id}` }
  }

  // ── Acknowledgement rendered as a dropdown ──
  //
  // Greenhouse renders "I understand and agree that…" as a <select> whose only
  // option is "I agree". That is a consent control wearing a dropdown's clothes,
  // and the affirmative option is the only answer that lets the form submit.
  //
  // Both conditions below are load-bearing. `isConsentQuestion` alone matches on
  // words like "gdpr" and "privacy policy", which turned a real skills question —
  // "Do you have experience working with data privacy regulations such as GDPR,
  // CCPA…?" — into an automatic "Yes". Requiring the OPTIONS to be
  // acknowledgement-shaped is what separates a statement you agree to from a
  // question about the candidate: a Yes/No pair is never an acknowledgement.
  if (isChoiceShape(shape) && isConsentQuestion(label) && isAcknowledgementOptions(field.options)) {
    const affirmative = field.options.find((o) => AFFIRMATIVE_OPTION.test(o.trim()))
    return { route: "choice", value: affirmative || field.options[0] || "Yes", why: "acknowledgement rendered as a dropdown" }
  }


  // ── Exactly one possible answer ──
  //
  // Zscaler renders "Zscaler Confidential Information" and "Zscaler Privacy
  // Policy" as required controls whose only option is "I Agree". There is
  // nothing to decide: the single option IS the answer, and calling a model to
  // discover that wastes a round trip and can still fail. Note this is not a
  // guess — any other value is unsubmittable.
  if (isChoiceShape(shape) || shape === "checkbox") {
    const real = field.options.filter((o) => o.trim() && !isPlaceholderOption(o))
    if (real.length === 1 && field.required) {
      return { route: "choice", value: real[0], why: "the only option the form offers" }
    }
  }

  // ── Required yes/no screener with no rule: answer it affirmatively ──
  //
  // The knockout questions employers bolt onto a posting — "Do you have
  // hands-on experience with Collibra or Alation?", "Have you professionally
  // used SQL against production data?" — are unmappable by construction: the
  // subject is whatever that employer cares about, so no bank can enumerate
  // them. They were falling through to the model, which had only the résumé to
  // go on and therefore answered No to anything not literally listed there, and
  // answered inconsistently across retries for everything else.
  //
  // A required screener left blank blocks the submit outright, so the choice is
  // not between a good answer and a bad one — it is between an affirmative and
  // an abandoned application.
  //
  // This is safe ONLY because of what has already run above it:
  //
  //   - `isSensitiveQuestion` has claimed criminal history, health and
  //     immigration status, which are routed to a human and never auto-filled.
  //   - The boolean bank has claimed every negative-framed question, where Yes
  //     is the damaging answer: sponsorship, non-competes, PIPs, terminations,
  //     sanctioned countries, restricted parties, government conflicts.
  //
  // So the questions reaching this line are the ones where Yes is merely a
  // claim of experience. Adding a new negative-framed question to the bank is
  // therefore load-bearing, not cosmetic — an unclaimed one gets a Yes here.
  //
  // Restricted to REQUIRED fields deliberately. An optional screener blocks
  // nothing, so there is no reason to assert experience to clear it; it goes to
  // the model like any other unmapped choice.
  // Deliberately NOT extended to unknown options, unlike the bank above. The bank
  // fires on anchored, question-shaped patterns that identify a specific question;
  // this default fires on anything left over, and asserting "Yes" into a control we
  // cannot even see the options of is a guess with no evidence behind it at all.
  if (isBooleanChoice(field.options) && field.required) {
    const yes = field.options.find((o) => AFFIRMATIVE.test(o.trim()))
    if (yes) {
      return {
        route: "choice",
        value: yes,
        why: "required yes/no screener with no bank rule — affirmative default",
      }
    }
  }

  // A choice control we have no rule for still must not be guessed at as free
  // text — the model has to pick from the real options.
  if (isChoiceShape(shape)) {
    return { route: "choice", value: "", why: "unmapped choice — model picks from the real options" }
  }

  return { route: "llm", why: "unmapped question" }
}

/**
 * Sanity-check an answer against the control it is about to be written into.
 *
 * The last line of defence against a mismatch. Even with correct routing, a
 * stale `idx:` key or a re-rendered form can point us at the wrong node, and
 * this catches the cases where the value is obviously wrong for the field:
 * an email in a phone box, a 400-word essay in a single-line input, a free-text
 * string offered to a dropdown that does not list it.
 */
export function validateAnswerForField(
  field: PolicyField,
  value: string
): { ok: true } | { ok: false; reason: string } {
  const v = (value ?? "").trim()
  if (!v) return { ok: false, reason: "empty value" }
  const label = (field.label || "").toLowerCase()
  const shape = shapeOf(field.kind)

  if (shape === "text" || shape === "unknown") {
    // Prose does not belong in a single-line input.
    if (shape === "text" && v.length > 300) {
      return { ok: false, reason: `${v.length}-character answer in a single-line field` }
    }
    if (/\b(e-?mail)\b/.test(label) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      return { ok: false, reason: `"${v.slice(0, 30)}" is not an email address` }
    }
    if (/\b(phone|mobile|telephone|contact number)\b/.test(label)) {
      const digits = v.replace(/\D/g, "")
      if (digits.length < 7 || /@/.test(v)) {
        return { ok: false, reason: `"${v.slice(0, 30)}" is not a phone number` }
      }
    }
    if (/\b(linked\s*-?\s*in|git\s*-?\s*hub|url|website|portfolio)\b/.test(label) && /\s/.test(v) && !/^https?:/i.test(v)) {
      return { ok: false, reason: `"${v.slice(0, 30)}" is not a URL` }
    }
  }

  // A choice control with a known option list: the answer has to be reachable.
  if (isChoiceShape(shape) && field.options.length > 0) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    const want = norm(v)
    const hit = field.options.some((o) => {
      const n = norm(o)
      return n === want || n.startsWith(want) || want.startsWith(n) || n.includes(want) || want.includes(n)
    })
    if (!hit) return { ok: false, reason: `"${v.slice(0, 40)}" is not among the offered options` }
  }

  return { ok: true }
}

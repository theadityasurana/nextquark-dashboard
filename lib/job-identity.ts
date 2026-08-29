/**
 * Stable, deterministic job identity.
 *
 * The sync path in app/api/ats-sync/route.ts dedupes incoming postings by exact
 * string match on `job_url`, and mints new ids with `Math.random()`. Both are
 * fragile in the same way: ATS URLs vary constantly without the posting
 * changing, so the same job arrives looking new.
 *
 *   boards.greenhouse.io/acme/jobs/4012345
 *   boards.greenhouse.io/acme/jobs/4012345?gh_src=a1b2c3   ← tracking param
 *   boards.greenhouse.io/acme/jobs/4012345/                ← trailing slash
 *   job-boards.greenhouse.io/acme/jobs/4012345             ← host variant
 *
 * All four are one posting. {@link atsPostingKey} folds them to
 * `greenhouse:4012345`, so dedupe survives URL churn and an id derived from
 * that key stays stable across re-syncs — which is what lets anything be safely
 * cached against a job id.
 *
 * Pure and dependency-free.
 */

/** Deterministic FNV-1a hash (base36) — stable across runs and processes. */
function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** Best-effort registrable domain: the last two dot-labels of a hostname. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, "").split(".")
  return labels.length <= 2 ? labels.join(".") : labels.slice(-2).join(".")
}

/**
 * A stable key for an ATS posting — `greenhouse:4012345`, `lever:6f1c…` — derived
 * from the posting id embedded in the URL. Returns null when the URL isn't a
 * recognizable single-posting page, in which case the caller should fall back to
 * {@link normalizeJobUrl}.
 */
export function atsPostingKey(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  const path = url.pathname.replace(/\/+$/, "")

  // Greenhouse: (job-)boards.greenhouse.io/<org>/jobs/<id>, or any host
  // embedding the apply iframe via ?gh_jid=<id>.
  if (host.endsWith("greenhouse.io")) {
    const m = /\/jobs\/(\d+)/.exec(path)
    if (m) return `greenhouse:${m[1]}`
  }
  const ghJid = url.searchParams.get("gh_jid")
  if (ghJid && /^\d+$/.test(ghJid)) return `greenhouse:${ghJid}`

  // Lever: jobs.lever.co/<org>/<uuid>[/apply]
  if (host.endsWith("lever.co")) {
    const m = /^\/[^/]+\/([0-9a-f-]{16,})/i.exec(path)
    if (m) return `lever:${m[1].toLowerCase()}`
  }

  // Ashby: jobs.ashbyhq.com/<org>/<uuid>[/application]
  if (host.endsWith("ashbyhq.com")) {
    const m = /^\/[^/]+\/([0-9a-f-]{16,})/i.exec(path)
    if (m) return `ashby:${m[1].toLowerCase()}`
  }

  // SmartRecruiters: jobs.smartrecruiters.com/<org>/<numeric id>-<slug>
  if (host.endsWith("smartrecruiters.com")) {
    const m = /^\/[^/]+\/(\d{6,})/.exec(path)
    if (m) return `smartrecruiters:${m[1]}`
  }

  // Workday: <tenant>.myworkdayjobs.com/…/job/<location>/<slug>_<REQ-ID>
  if (host.endsWith("myworkdayjobs.com")) {
    const m = /_(R-?\d{4,}|JR-?\d{4,})/i.exec(path)
    if (m) return `workday:${host.split(".")[0]}:${m[1].toUpperCase()}`
  }

  return null
}

/**
 * Canonical form of a job URL for the cases {@link atsPostingKey} can't resolve.
 * Drops the protocol, `www.`, tracking parameters, trailing slashes, and the
 * fragment — the parts that vary without the posting changing.
 */
export function normalizeJobUrl(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    // Not parseable — fold whitespace/case so at least identical strings match.
    return rawUrl.trim().toLowerCase()
  }

  // Analytics and referral params never identify a posting.
  const DROP = /^(utm_|gh_src|ref|source|src|trk|lever-|from|campaign)/i
  const kept: Array<[string, string]> = []
  url.searchParams.forEach((v, k) => {
    if (!DROP.test(k)) kept.push([k, v])
  })
  // Sorted, so the same params in a different order fold to one key.
  kept.sort(([a], [b]) => a.localeCompare(b))

  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const path = url.pathname.replace(/\/+$/, "")
  const query = kept.length ? `?${kept.map(([k, v]) => `${k}=${v}`).join("&")}` : ""
  return `${host}${path}${query}`.toLowerCase()
}

/**
 * The dedupe key for a posting: its ATS posting key when we can derive one,
 * otherwise its normalized URL. Two postings sharing this key are the same job.
 */
export function jobDedupeKey(rawUrl: string): string {
  return atsPostingKey(rawUrl) ?? normalizeJobUrl(rawUrl)
}

/**
 * A deterministic job id derived from the posting itself, so re-syncing the
 * same posting produces the same id.
 *
 * `prefix` keeps the existing readable shape (the company initial). The hash is
 * of the full dedupe key, so a truncated slug can never collide two distinct
 * postings. Never random — a fresh id each sync defeats every id-keyed cache and
 * silently accumulates duplicate rows.
 */
export function stableJobId(prefix: string, rawUrl: string, title?: string): string {
  const key = jobDedupeKey(rawUrl)
  const slug = (title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
  const clean = (prefix || "job").replace(/[^A-Za-z0-9]/g, "") || "job"
  return slug ? `${clean}-${slug}-${hashString(key)}` : `${clean}-${hashString(key)}`
}

// ─── Title / company normalization ───
// jobDedupeKey above collapses URL variants of one posting. This collapses the
// other half: the SAME role listed with cosmetically different text, which is
// what happens when a job is syndicated across boards.
//
//   "Senior Python Developer (m/f/d) - Remote"  →  "senior python developer"
//   "Google Germany GmbH"                        →  "google"

/**
 * Gender/diversity suffixes that are mandatory in some EU postings and carry no
 * information about the role. German (m/w/d), English (all genders), and the
 * many punctuation variants of both.
 */
const GENDER_SUFFIX = /\(\s*(?:m\s*[\/|]\s*f\s*[\/|]\s*d|m\s*[\/|]\s*w\s*[\/|]\s*d|w\s*[\/|]\s*m\s*[\/|]\s*d|d\s*[\/|]\s*m\s*[\/|]\s*w|m\s*[\/|]\s*f|f\s*[\/|]\s*m|all\s+genders?|any\s+gender|gn|fmd|mfd)\s*\)/gi

/** Work arrangement and employment type — attributes of the posting, not the role. */
const WORK_TYPE =
  /\b(?:remote(?:\s*[-–]?\s*first)?|hybrid|on[-\s]?site|onsite|in[-\s]?office|full[-\s]?time|part[-\s]?time|permanent|contract|contractor|freelance|internship|intern|temporary|temp|w2|c2c)\b/gi

/** Legal entity suffixes. "Google Germany GmbH" and "Google" are one employer. */
const LEGAL_SUFFIX =
  /\b(?:llc|l\.l\.c|ltd|limited|inc|incorporated|corp|corporation|co|gmbh|mbh|ag|se|s\.?a\.?s?|s\.?r\.?l|b\.?v|n\.?v|plc|pty|pvt|private|oy|ab|as|a\/s|kk|k\.k|sp\s*z\s*o\.?o|sarl|holding|group|technologies|technology|labs|software)\b/gi

/** Country/region qualifiers appended to a subsidiary's name. */
const COMPANY_REGION =
  /\b(?:germany|deutschland|india|usa|u\.s\.a|uk|united\s+kingdom|france|spain|italy|netherlands|poland|canada|australia|singapore|japan|brasil|brazil|emea|apac|americas|international|global|worldwide)\b/gi

/** Seniority words that DO define the role and must survive normalization. */
const SENIORITY_KEEP = /\b(?:senior|sr|junior|jr|lead|principal|staff|head|chief|director|vp|intern|entry|mid|associate)\b/i

function collapse(s: string): string {
  return s
    .replace(/[^a-z0-9+#.\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Canonical form of a job title for dedupe.
 *
 * Strips gender suffixes, work-type words, bracketed asides, and punctuation —
 * but deliberately KEEPS seniority ("senior", "lead", "principal"), because a
 * Senior and a Junior opening at the same company are different jobs and must
 * not collapse into one.
 */
export function normalizeJobTitle(raw: string | null | undefined): string {
  if (!raw) return ""
  let s = String(raw).toLowerCase()
  s = s.replace(GENDER_SUFFIX, " ")
  // Any remaining bracketed aside — "(Remote)", "[Contract]", "(Berlin)".
  s = s.replace(/[([{][^)\]}]{0,40}[)\]}]/g, " ")
  s = s.replace(WORK_TYPE, " ")
  s = collapse(s)
  // Trailing location/aside after a dash: "Engineer - Berlin" → "engineer".
  s = s.replace(/\s+[-–—]\s+.*$/, "")
  return collapse(s)
}

/**
 * Canonical form of a company name for dedupe: legal suffixes and regional
 * qualifiers removed. Falls back to the collapsed original if stripping would
 * leave nothing — "Limited Inc" must not normalize to the empty string.
 */
export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return ""
  const base = collapse(String(raw).toLowerCase().replace(/[.,]/g, " "))
  if (!base) return ""
  let s = base.replace(LEGAL_SUFFIX, " ").replace(COMPANY_REGION, " ")
  s = collapse(s)
  return s || base
}

/**
 * A content-based dedupe key for postings whose URLs differ but which are the
 * same role at the same employer — the syndication case that {@link jobDedupeKey}
 * cannot see, because those postings genuinely live at different URLs.
 *
 * Returns "" when either side normalizes away, so callers can tell "no key"
 * from a key that would match everything.
 */
export function jobContentKey(
  title: string | null | undefined,
  company: string | null | undefined
): string {
  const t = normalizeJobTitle(title)
  const c = normalizeCompanyName(company)
  if (!t || !c) return ""
  return `${c}::${t}`
}

/** Whether a normalized title still carries a seniority marker. */
export function hasSeniorityMarker(title: string | null | undefined): boolean {
  return SENIORITY_KEEP.test(normalizeJobTitle(title))
}

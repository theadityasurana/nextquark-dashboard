/**
 * ATS portal detection.
 *
 * Previously this returned the first regex that matched, with no confidence
 * signal — so a URL that merely *mentions* a portal name scored the same as a
 * canonical board URL, and an unrecognized portal fell through to null and
 * failed silently mid-run. Detection is now scored: a canonical host pattern
 * outranks a generic mention, and callers get a confidence number they can route
 * on (dispatch confidently, or divert to manual review).
 *
 * `detectPortal` keeps its original signature and semantics so existing callers
 * are unaffected; the score is available via {@link detectPortalScored}.
 */

export interface PortalPattern {
  name: string
  urlPatterns: RegExp[]
  supportsDirectApi: boolean
  getApplyUrl: (url: string) => string
  /**
   * Canonical host shapes — a match here is near-certain, because only the real
   * board serves these. Weighted far above a loose name mention.
   */
  canonicalPatterns?: RegExp[]
  /** Query/path markers an embedded or proxied form leaves behind. */
  embedPatterns?: RegExp[]
}

export const PORTAL_PATTERNS: PortalPattern[] = [
  {
    name: "Lever",
    urlPatterns: [/lever\.co/, /jobs\.lever\.co/],
    canonicalPatterns: [/^https?:\/\/jobs\.lever\.co\/[^/]+\/[0-9a-f-]{16,}/i],
    supportsDirectApi: true,
    // Always navigate directly to /apply — skips the listing page and the "Apply for this job" button entirely
    getApplyUrl: (url) => {
      const base = url.replace(/\/?$/, "").replace(/\/apply$/, "")
      return base + "/apply"
    },
  },
  {
    name: "Greenhouse",
    urlPatterns: [/greenhouse\.io/, /boards\.greenhouse\.io/],
    canonicalPatterns: [/^https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/[^/]+\/jobs\/\d+/i],
    embedPatterns: [/[?&]gh_jid=\d+/i, /grnhse/i],
    supportsDirectApi: true,
    // Strip hash — we wait for #app form inside playwright.execute() with waitForSelector
    getApplyUrl: (url) => url.replace(/#.*$/, ""),
  },
  {
    name: "Ashby",
    urlPatterns: [/ashbyhq\.com/, /jobs\.ashbyhq\.com/],
    canonicalPatterns: [/^https?:\/\/jobs\.ashbyhq\.com\/[^/]+\/[0-9a-f-]{16,}/i],
    supportsDirectApi: true,
    // jobs.ashbyhq.com/<org>/<id> is the job DESCRIPTION — it has no form on it,
    // just an "Apply for this Job" button. Landing there meant zero file inputs
    // and an audit that reported "all required fields filled" because there were
    // no fields at all. The form is at /application, so go straight there, the
    // same way Lever skips its listing page via /apply.
    getApplyUrl: (url) => {
      const [base, ...rest] = url.split(/[?#]/)
      const suffix = url.slice(base.length) // preserve ?query / #hash
      const trimmed = base.replace(/\/+$/, "")
      if (/\/application$/i.test(trimmed)) return trimmed + suffix
      return trimmed + "/application" + suffix
    },
  },
  {
    name: "SmartRecruiters",
    urlPatterns: [/smartrecruiters\.com/],
    canonicalPatterns: [/^https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\//i],
    supportsDirectApi: true,
    // ─── The stored URL is the API, not the application ───
    //
    // Every SmartRecruiters row in the jobs table (1,566 of them, and not one
    // exception) holds the posting's REST endpoint —
    //   https://api.smartrecruiters.com/v1/companies/<Company>/postings/<id>
    // — because that is what the ingest read them from. It matches
    // /smartrecruiters\.com/ so the portal is detected correctly, and then the
    // browser is pointed at a JSON document. There is no form on it to fill, so
    // the run scans zero fields, which audits as "nothing required is missing".
    //
    // The canonical apply page is derived from the same two path segments the
    // API URL already carries, so no lookup is needed.
    getApplyUrl: (url) => {
      const m = url.match(/api\.smartrecruiters\.com\/v1\/companies\/([^/?#]+)\/postings\/([^/?#]+)/i)
      return m ? `https://jobs.smartrecruiters.com/${m[1]}/${m[2]}` : url
    },
  },
  {
    name: "BambooHR",
    urlPatterns: [/bamboohr\.com/],
    canonicalPatterns: [/^https?:\/\/[^/]+\.bamboohr\.com\/(?:careers|jobs)\//i],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "Jobvite",
    urlPatterns: [/jobvite\.com/, /\.jobvite\.com/],
    canonicalPatterns: [/^https?:\/\/jobs\.jobvite\.com\//i],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "Workday",
    urlPatterns: [/myworkdayjobs\.com/, /workday\.com/],
    canonicalPatterns: [/^https?:\/\/[^/]+\.myworkdayjobs\.com\//i],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "iCIMS",
    urlPatterns: [/icims\.com/, /\.icims\.com/],
    canonicalPatterns: [/^https?:\/\/[^/]+\.icims\.com\/jobs\//i],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
  {
    name: "LinkedIn",
    urlPatterns: [/linkedin\.com\/jobs/],
    canonicalPatterns: [/^https?:\/\/(?:www\.)?linkedin\.com\/jobs\/view\/\d+/i],
    supportsDirectApi: false,
    getApplyUrl: (url) => url,
  },
]

export interface PortalDetection {
  portal: PortalPattern
  /** 0..100. See CONFIDENT_THRESHOLD for what's safe to dispatch on. */
  confidence: number
  /** Which signals fired — shown in the UI so a low score is explainable. */
  signals: string[]
}

/**
 * Score at or above which we dispatch without hesitation. A canonical host match
 * alone clears it; a bare name mention deliberately does not, because those are
 * the URLs that waste a session discovering the form isn't where we expected.
 */
export const CONFIDENT_THRESHOLD = 70

const CANONICAL_WEIGHT = 70
const EMBED_WEIGHT = 45
const URL_WEIGHT = 30
/** A match in the host outranks one anywhere in the URL (e.g. a query param). */
const HOST_BONUS = 20

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ""
  }
}

function score(url: string, portal: PortalPattern): { confidence: number; signals: string[] } {
  const signals: string[] = []
  let confidence = 0
  const host = hostOf(url)

  if (portal.canonicalPatterns?.some((re) => re.test(url))) {
    confidence += CANONICAL_WEIGHT
    signals.push("canonical posting URL")
  }
  if (portal.embedPatterns?.some((re) => re.test(url))) {
    confidence += EMBED_WEIGHT
    signals.push("embedded form marker")
  }
  if (portal.urlPatterns.some((re) => re.test(url))) {
    confidence += URL_WEIGHT
    signals.push("URL pattern")
    if (host && portal.urlPatterns.some((re) => re.test(host))) {
      confidence += HOST_BONUS
      signals.push("host match")
    }
  }

  return { confidence: Math.min(confidence, 100), signals }
}

/**
 * Best-scoring portal for a URL, with confidence, or null when nothing matches.
 * Ties break toward the earlier entry in PORTAL_PATTERNS.
 */
export function detectPortalScored(url: string): PortalDetection | null {
  let best: PortalDetection | null = null
  for (const portal of PORTAL_PATTERNS) {
    const { confidence, signals } = score(url, portal)
    if (confidence <= 0) continue
    if (!best || confidence > best.confidence) best = { portal, confidence, signals }
  }
  return best
}

/**
 * The original API: the matching portal, or null. Unchanged semantics for every
 * existing caller — use {@link detectPortalScored} when the score matters.
 */
export function detectPortal(url: string): PortalPattern | null {
  return detectPortalScored(url)?.portal ?? null
}


/**
 * The URL that actually shows an application FORM, resolved over the network.
 *
 * `getApplyUrl` is a pure string rewrite, which is all most portals need: Ashby
 * appends /application, Lever appends /apply. SmartRecruiters cannot be done that
 * way. Its posting page carries no form and no apply button this scanner can
 * find — a live ServiceNow run reported "no-apply-button-found" and a form
 * inventory of ZERO controls — because the form lives behind a separate URL keyed
 * by a publication UUID that the posting id does not contain.
 *
 * Its public API hands over both, so this asks rather than guesses:
 *
 *   GET /v1/companies/<Company>/postings/<id>
 *     → applyUrl:  …/<id>-<slug>?oga=true      ← the form
 *       postingUrl: …/<id>-<slug>              ← the advert
 *       uuid:       <publication uuid>         ← for the oneclick form
 *
 * Best-effort by design: on any failure it falls back to the string rewrite, so a
 * network hiccup degrades to today's behaviour instead of failing the run.
 */
export async function resolveApplyUrl(rawUrl: string, timeoutMs = 8000): Promise<string> {
  const portal = detectPortal(rawUrl)
  const fallback = portal?.getApplyUrl(rawUrl) || rawUrl
  if (portal?.name !== "SmartRecruiters") return fallback

  const m = rawUrl.match(/smartrecruiters\.com\/(?:v1\/companies\/)?([^/?#]+)\/(?:postings\/)?(\d+)/i)
  if (!m) return fallback

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(m[1])}/postings/${encodeURIComponent(m[2])}`,
      { signal: ctl.signal }
    )
    if (!res.ok) return fallback
    const j: any = await res.json()
    // applyUrl carries ?oga=true, which is what opens the form rather than the ad.
    if (typeof j?.applyUrl === "string" && j.applyUrl) return j.applyUrl
    if (typeof j?.uuid === "string" && j.uuid) {
      return `https://jobs.smartrecruiters.com/oneclick-ui/company/${encodeURIComponent(m[1])}/publication/${j.uuid}?dcr_ci=${encodeURIComponent(m[1])}`
    }
    return fallback
  } catch {
    return fallback
  } finally {
    clearTimeout(timer)
  }
}

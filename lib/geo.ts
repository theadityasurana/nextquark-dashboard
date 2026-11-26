// Country / city helpers for the Marketing page. Works on profile data:
// `location` is free text like "Bangalore, India" or "Austin, TX"; `country_code` is a phone
// dial code like "+91". We take the country from the location when we can, else the dial code.

export const WORLD_COUNTRIES = 195

const names = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null

export function countryName(code: string | null | undefined): string {
  if (!code) return "Unknown"
  try { return names?.of(code.toUpperCase()) ?? code } catch { return code }
}

// Every ISO country name → code, built once from Intl (e.g. "india" → "IN").
const byName: Map<string, string> = (() => {
  const m = new Map<string, string>()
  if (!names) return m
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  for (const a of A) for (const b of A) {
    const code = a + b
    try {
      const n = names.of(code)
      if (n && n !== code) m.set(n.toLowerCase(), code)
    } catch { /* not a region */ }
  }
  return m
})()

const ALIASES: Record<string, string> = {
  usa: "US", us: "US", "u.s.": "US", "u.s.a.": "US", america: "US", "united states of america": "US",
  uk: "GB", "u.k.": "GB", england: "GB", scotland: "GB", wales: "GB", britain: "GB", "great britain": "GB",
  uae: "AE", "u.a.e.": "AE", emirates: "AE", bharat: "IN", "republic of korea": "KR", "south korea": "KR", korea: "KR",
  russia: "RU", vietnam: "VN", "czech republic": "CZ", holland: "NL", "ivory coast": "CI", turkey: "TR", "türkiye": "TR",
}

const INDIAN_STATES = ["andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh", "goa", "gujarat", "haryana", "himachal pradesh",
  "jharkhand", "karnataka", "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya", "mizoram", "nagaland", "odisha", "orissa",
  "punjab", "rajasthan", "sikkim", "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand", "west bengal", "delhi", "new delhi",
  "jammu and kashmir", "ladakh", "chandigarh", "puducherry", "ncr", "uttar"]
const US_STATES = ["al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn",
  "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy", "dc", "california", "texas", "new york", "florida", "washington", "massachusetts", "illinois", "new jersey", "georgia", "virginia"]

// Dial code → country (the common ones; +1 is US/Canada, counted as US).
const DIAL: Record<string, string> = {
  "1": "US", "7": "RU", "20": "EG", "27": "ZA", "30": "GR", "31": "NL", "32": "BE", "33": "FR", "34": "ES", "39": "IT", "40": "RO", "41": "CH",
  "43": "AT", "44": "GB", "45": "DK", "46": "SE", "47": "NO", "48": "PL", "49": "DE", "51": "PE", "52": "MX", "54": "AR", "55": "BR", "56": "CL",
  "57": "CO", "60": "MY", "61": "AU", "62": "ID", "63": "PH", "64": "NZ", "65": "SG", "66": "TH", "81": "JP", "82": "KR", "84": "VN", "86": "CN",
  "90": "TR", "91": "IN", "92": "PK", "93": "AF", "94": "LK", "95": "MM", "98": "IR", "211": "SS", "212": "MA", "213": "DZ", "216": "TN",
  "220": "GM", "221": "SN", "233": "GH", "234": "NG", "237": "CM", "250": "RW", "251": "ET", "254": "KE", "255": "TZ", "256": "UG", "260": "ZM",
  "263": "ZW", "351": "PT", "353": "IE", "880": "BD", "960": "MV", "961": "LB", "962": "JO", "966": "SA", "971": "AE", "972": "IL", "974": "QA",
  "977": "NP", "965": "KW", "968": "OM", "973": "BH",
}

function fromDial(cc: string | null | undefined): string | null {
  const d = String(cc || "").replace(/\D/g, "")
  if (!d) return null
  // Typos like "+918" (91 + first digit of the number): try the longest known prefix.
  for (const len of [3, 2, 1]) if (DIAL[d.slice(0, len)]) return DIAL[d.slice(0, len)]
  return null
}

function fromPlace(part: string): string | null {
  const p = part.trim().toLowerCase().replace(/\s+/g, " ")
  if (!p) return null
  if (ALIASES[p]) return ALIASES[p]
  if (byName.has(p)) return byName.get(p)!
  if (INDIAN_STATES.includes(p)) return "IN"
  if (US_STATES.includes(p)) return "US"
  return null
}

/** ISO country code for a profile, or null if we can't tell. */
export function resolveCountry(location: string | null | undefined, dialCode?: string | null): string | null {
  const parts = String(location || "").split(",").map(s => s.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = fromPlace(parts[i])
    if (c) return c
  }
  return fromDial(dialCode)
}

const CITY_FIX: Record<string, string> = { bengaluru: "Bangalore", "new delhi": "Delhi", gurgaon: "Gurugram", bombay: "Mumbai", calcutta: "Kolkata", madras: "Chennai", "navi mumbai": "Navi Mumbai" }

/** The city part of a free-text location, tidied ("Bengaluru, India" → "Bangalore"). */
export function cityOf(location: string | null | undefined): string | null {
  const first = String(location || "").split(",")[0]?.trim()
  if (!first || first.length < 2 || fromPlace(first)) return null
  const key = first.toLowerCase()
  return CITY_FIX[key] ?? first.replace(/\b\w/g, c => c.toUpperCase())
}

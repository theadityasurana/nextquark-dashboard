/**
 * Resolve which country a candidate's phone number belongs to.
 *
 * The country-code picker was hardcoded to India/+91, so every non-Indian
 * candidate silently got the wrong dial code on their application — a real data
 * error, not just an automation miss. This derives it from the candidate's own
 * data instead: their stored dial code first, then their location.
 *
 * Pure, so the resolution order is testable.
 */

export interface PhoneCountry {
  name: string
  /** E.164 dial prefix, including the leading "+". */
  dial: string
  /** ISO 3166-1 alpha-2, lowercase. */
  iso: string
}

/**
 * The countries our candidates actually come from. Deliberately not exhaustive:
 * a wrong guess writes a wrong phone number onto a real application, so unknown
 * input falls back to a single documented default rather than a near-match.
 */
export const COUNTRIES: PhoneCountry[] = [
  { name: "India", dial: "+91", iso: "in" },
  { name: "United States", dial: "+1", iso: "us" },
  { name: "Canada", dial: "+1", iso: "ca" },
  { name: "United Kingdom", dial: "+44", iso: "gb" },
  { name: "Australia", dial: "+61", iso: "au" },
  { name: "Germany", dial: "+49", iso: "de" },
  { name: "France", dial: "+33", iso: "fr" },
  { name: "Netherlands", dial: "+31", iso: "nl" },
  { name: "Ireland", dial: "+353", iso: "ie" },
  { name: "Singapore", dial: "+65", iso: "sg" },
  { name: "United Arab Emirates", dial: "+971", iso: "ae" },
  { name: "Poland", dial: "+48", iso: "pl" },
  { name: "Spain", dial: "+34", iso: "es" },
  { name: "Brazil", dial: "+55", iso: "br" },
  { name: "Mexico", dial: "+52", iso: "mx" },
  { name: "Japan", dial: "+81", iso: "jp" },
  { name: "New Zealand", dial: "+64", iso: "nz" },
  { name: "South Africa", dial: "+27", iso: "za" },
  { name: "Israel", dial: "+972", iso: "il" },
  { name: "Switzerland", dial: "+41", iso: "ch" },
]

export const DEFAULT_COUNTRY: PhoneCountry = COUNTRIES[0]

/** City / region hints that identify a country when the location omits it. */
const LOCATION_HINTS: Array<{ re: RegExp; iso: string }> = [
  { re: /\b(india|bangalore|bengaluru|gurgaon|gurugram|noida|delhi|mumbai|pune|hyderabad|chennai|kolkata)\b/i, iso: "in" },
  { re: /\b(usa|u\.s\.a|united states|america|new york|san francisco|seattle|austin|boston|chicago|los angeles)\b/i, iso: "us" },
  { re: /\b(canada|toronto|vancouver|montreal|ottawa|calgary)\b/i, iso: "ca" },
  { re: /\b(uk|u\.k|united kingdom|england|london|manchester|edinburgh|scotland|wales)\b/i, iso: "gb" },
  { re: /\b(australia|sydney|melbourne|brisbane|perth)\b/i, iso: "au" },
  { re: /\b(germany|deutschland|berlin|munich|münchen|hamburg)\b/i, iso: "de" },
  { re: /\b(france|paris|lyon|marseille)\b/i, iso: "fr" },
  { re: /\b(netherlands|holland|amsterdam|rotterdam)\b/i, iso: "nl" },
  { re: /\b(ireland|dublin)\b/i, iso: "ie" },
  { re: /\b(singapore)\b/i, iso: "sg" },
  { re: /\b(uae|dubai|abu dhabi|emirates)\b/i, iso: "ae" },
  { re: /\b(poland|warsaw|krakow|kraków)\b/i, iso: "pl" },
  { re: /\b(spain|madrid|barcelona)\b/i, iso: "es" },
  { re: /\b(brazil|brasil|sao paulo|são paulo|rio de janeiro)\b/i, iso: "br" },
  { re: /\b(mexico|méxico|mexico city|guadalajara)\b/i, iso: "mx" },
  { re: /\b(japan|tokyo|osaka)\b/i, iso: "jp" },
  { re: /\b(new zealand|auckland|wellington)\b/i, iso: "nz" },
  { re: /\b(south africa|johannesburg|cape town)\b/i, iso: "za" },
  { re: /\b(israel|tel aviv|jerusalem)\b/i, iso: "il" },
  { re: /\b(switzerland|zurich|zürich|geneva)\b/i, iso: "ch" },
]

function byIso(iso: string): PhoneCountry | undefined {
  return COUNTRIES.find((c) => c.iso === iso)
}

/**
 * The candidate's phone country.
 *
 * Resolution order, most authoritative first:
 *   1. An explicit stored dial code (`country_code` / `countryCode`)
 *   2. A dial prefix already present on the phone number itself
 *   3. A country or city named in their location
 *   4. {@link DEFAULT_COUNTRY}
 *
 * +1 is ambiguous between US and Canada; it resolves to US unless the location
 * says otherwise, which is the safer default by volume.
 */
export function resolvePhoneCountry(userData: {
  countryCode?: string | null
  country_code?: string | null
  phone?: string | null
  location?: string | null
  country?: string | null
}): PhoneCountry {
  const explicit = String(userData?.countryCode ?? userData?.country_code ?? "").trim()
  const location = String(userData?.location ?? userData?.country ?? "").trim()
  const phone = String(userData?.phone ?? "").trim()

  const locationIso = LOCATION_HINTS.find((h) => h.re.test(location))?.iso

  // 1. Explicit dial code.
  if (explicit) {
    const digits = explicit.replace(/\D/g, "")
    if (digits) {
      const dial = `+${digits}`
      // Prefer a country consistent with the stated location for shared codes.
      if (locationIso) {
        const viaLocation = byIso(locationIso)
        if (viaLocation && viaLocation.dial === dial) return viaLocation
      }
      const match = COUNTRIES.find((c) => c.dial === dial)
      if (match) return match
    }
    // Also accept an ISO code stored in the same field.
    const iso = explicit.toLowerCase().replace(/[^a-z]/g, "")
    if (iso.length === 2) {
      const match = byIso(iso)
      if (match) return match
    }
  }

  // 2. Dial prefix on the number itself. Longest prefix wins so +91 doesn't
  //    lose to +9, and +353 doesn't resolve as +3.
  if (phone.startsWith("+")) {
    const candidates = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
    const normalized = "+" + phone.slice(1).replace(/\D/g, "")
    for (const c of candidates) {
      if (normalized.startsWith(c.dial)) {
        if (locationIso) {
          const viaLocation = byIso(locationIso)
          if (viaLocation && viaLocation.dial === c.dial) return viaLocation
        }
        return c
      }
    }
  }

  // 3. Location.
  if (locationIso) {
    const match = byIso(locationIso)
    if (match) return match
  }

  return DEFAULT_COUNTRY
}

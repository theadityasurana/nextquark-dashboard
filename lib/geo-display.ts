export function countryLabel(code: string | null | undefined) {
  if (!code || code === "—") return "Unknown"
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code
  } catch {
    return code
  }
}

export function placeLine(v: {
  city?: string | null
  locality?: string | null
  region?: string | null
  country?: string | null
  postal_code?: string | null
}) {
  const parts = [
    v.locality && v.locality !== v.city ? v.locality : null,
    v.city,
    v.region,
    v.country ? countryLabel(v.country) : null,
    v.postal_code ? `PIN ${v.postal_code}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(", ") : ""
}

export type PlaceSource = "gps_geocode" | "gps_only" | "ip"

export function resolvePlaceSource(place_source?: string | null, location_source?: string | null): PlaceSource {
  if (place_source === "gps_geocode" || place_source === "gps_only" || place_source === "ip") {
    return place_source
  }
  if (location_source === "gps") return "gps_only"
  return "ip"
}

export function locColumnLabel(place_source?: string | null, location_source?: string | null) {
  const src = resolvePlaceSource(place_source, location_source)
  if (src === "gps_geocode") return "GPS+address"
  if (src === "gps_only") return "GPS"
  return "IP"
}


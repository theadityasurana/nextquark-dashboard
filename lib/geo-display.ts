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

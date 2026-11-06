const HEARD_ABOUT_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  know_founder: "Know the founder",
  friends_colleagues: "Friends / colleagues",
  instagram: "Instagram",
  advertisement: "Advertisement",
  twitter: "Twitter / X",
  google: "Google",
  app_store: "App Store",
  play_store: "Play Store",
  youtube: "YouTube",
  reddit: "Reddit",
  other: "Other",
}

/** A profile's stored "where did you hear about us" answer, as shown on the chart. */
export function heardAboutLabel(raw: string | null | undefined): string | null {
  const value = (raw || "").trim()
  if (!value) return null
  const known = HEARD_ABOUT_LABELS[value.toLowerCase()]
  if (known) return known
  const words = value.replace(/[_-]+/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A share of a total as a whole percentage, and 0 rather than NaN when the total is 0. */
export function percentOf(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

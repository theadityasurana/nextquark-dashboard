"use client"

import { useState } from "react"

/** A country's flag in a small circle (falls back to the two-letter code). */
export function CountryFlag({ code, size = 18, className = "" }: { code?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  const c = (code || "").toLowerCase()
  const box = { width: size, height: size }
  if (!/^[a-z]{2}$/.test(c) || broken) {
    return (
      <span style={box} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold uppercase text-muted-foreground ${className}`}>
        {c ? c.toUpperCase() : "?"}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${c}.png`}
      alt=""
      style={box}
      loading="lazy"
      onError={() => setBroken(true)}
      className={`inline-block shrink-0 rounded-full object-cover ring-1 ring-border ${className}`}
    />
  )
}

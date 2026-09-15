import { NextResponse } from "next/server"

/** Server-only CARTO key on Vercel. Do not store in Supabase. */
export async function GET() {
  const key = process.env.CARTO_API_KEY?.trim()

  if (!key) {
    return NextResponse.json({
      provider: "osm",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
      subdomains: "abc",
      maxZoom: 19,
    })
  }

  return NextResponse.json({
    provider: "carto",
    url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  })
}

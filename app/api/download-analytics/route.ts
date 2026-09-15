import { createAdminClient } from "@/lib/supabase/admin"
import type { DownloadAnalyticsPayload, DownloadVisitPin } from "@/lib/download-analytics-types"
import { dateInIst, hourInIst, startOfTodayIst } from "@/lib/ist"
import { NextResponse } from "next/server"

const BLR_LAT_MIN = 12.75
const BLR_LAT_MAX = 13.15
const BLR_LNG_MIN = 77.35
const BLR_LNG_MAX = 77.85
const PAGE = 1000
const MAX_ROWS = 5000

type VisitRow = {
  id: string
  created_at: string
  campaign: string | null
  latitude: number | null
  longitude: number | null
  device_type: string | null
}

function emptyPayload(error?: string): DownloadAnalyticsPayload {
  return {
    kpis: { today: 0, d7: 0, d30: 0 },
    pins: [],
    clusters: [],
    posters: [],
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, scans: 0 })),
    daily: [],
    devices: [],
    error: error ?? null,
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient()
    const now = new Date()
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const todayStart = startOfTodayIst(now)

    const rows: VisitRow[] = []
    let from = 0
    while (from < MAX_ROWS) {
      const to = Math.min(from + PAGE - 1, MAX_ROWS - 1)
      const { data, error } = await supabase
        .from("download_link_visits")
        .select("id, created_at, campaign, latitude, longitude, device_type")
        .gt("created_at", since30)
        .order("created_at", { ascending: false })
        .range(from, to)

      if (error) {
        return NextResponse.json(emptyPayload(error.message))
      }
      const batch = (data ?? []) as VisitRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
      from += PAGE
    }

    const kpis = { today: 0, d7: 0, d30: rows.length }
    const pins: DownloadVisitPin[] = []
    const clusterMap = new Map<string, { lat: number; lng: number; scans: number; sample_campaign: string | null }>()
    const posterMap = new Map<string, { scans: number; first_seen: string; last_seen: string }>()
    const hourCounts = Array.from({ length: 24 }, () => 0)
    const dailyMap = new Map<string, number>()
    const deviceMap = new Map<string, number>()

    for (let i = 13; i >= 0; i--) {
      const d = dateInIst(new Date(todayStart.getTime() - i * 24 * 60 * 60 * 1000))
      dailyMap.set(d, 0)
    }

    for (const row of rows) {
      const created = new Date(row.created_at)
      if (created >= todayStart) kpis.today++
      if (created >= since7) kpis.d7++

      hourCounts[hourInIst(row.created_at)]++

      const day = dateInIst(row.created_at)
      if (dailyMap.has(day)) dailyMap.set(day, (dailyMap.get(day) || 0) + 1)

      const spot = row.campaign?.trim() || "(untagged QR)"
      const prev = posterMap.get(spot)
      if (!prev) {
        posterMap.set(spot, { scans: 1, first_seen: row.created_at, last_seen: row.created_at })
      } else {
        prev.scans++
        if (row.created_at < prev.first_seen) prev.first_seen = row.created_at
        if (row.created_at > prev.last_seen) prev.last_seen = row.created_at
      }

      const device = (row.device_type || "unknown").toLowerCase()
      deviceMap.set(device, (deviceMap.get(device) || 0) + 1)

      const lat = row.latitude
      const lng = row.longitude
      if (lat == null || lng == null) continue
      if (lat < BLR_LAT_MIN || lat > BLR_LAT_MAX || lng < BLR_LNG_MIN || lng > BLR_LNG_MAX) continue

      pins.push({
        id: row.id,
        created_at: row.created_at,
        campaign: row.campaign,
        lat,
        lng,
        device_type: row.device_type,
      })

      const latBucket = Math.round(lat * 1000) / 1000
      const lngBucket = Math.round(lng * 1000) / 1000
      const key = `${latBucket},${lngBucket}`
      const cluster = clusterMap.get(key)
      if (!cluster) {
        clusterMap.set(key, { lat: latBucket, lng: lngBucket, scans: 1, sample_campaign: row.campaign })
      } else {
        cluster.scans++
      }
    }

    const clusters = [...clusterMap.values()]
      .filter((c) => c.scans >= 2)
      .sort((a, b) => b.scans - a.scans)

    const posters = [...posterMap.entries()]
      .map(([spot, v]) => ({ spot, ...v }))
      .sort((a, b) => b.scans - a.scans)

    const devices = [...deviceMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    return NextResponse.json({
      kpis,
      pins,
      clusters,
      posters,
      byHour: hourCounts.map((scans, hour) => ({ hour, scans })),
      daily: [...dailyMap.entries()].map(([day, scans]) => ({ day, scans })),
      devices,
      error: null,
    })
  } catch (err) {
    console.error("Download analytics fetch error:", err)
    return NextResponse.json(emptyPayload(err instanceof Error ? err.message : "Failed to load"), { status: 500 })
  }
}

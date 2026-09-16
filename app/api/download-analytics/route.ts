import { createAdminClient } from "@/lib/supabase/admin"
import type { DownloadAnalyticsPayload, DownloadVisitPin } from "@/lib/download-analytics-types"
import { dateInIst, hourInIst, startOfTodayIst } from "@/lib/ist"
import { resolvePlaceSource } from "@/lib/geo-display"
import { NextResponse } from "next/server"

const PAGE = 1000
const MAX_ROWS = 5000

type VisitRow = {
  id: string
  created_at: string
  campaign: string | null
  latitude: number | null
  longitude: number | null
  gps_latitude?: number | null
  gps_longitude?: number | null
  device_type: string | null
  location_source: string | null
  country: string | null
  city: string | null
  locality: string | null
  region: string | null
  postal_code: string | null
  continent: string | null
  place_source: string | null
}

const VISIT_SELECTS = [
  "id, created_at, campaign, latitude, longitude, device_type, location_source, place_source, gps_latitude, gps_longitude, country, city, locality, region, postal_code, continent",
  "id, created_at, campaign, latitude, longitude, device_type, location_source, gps_latitude, gps_longitude, country, city, locality, region, postal_code, continent",
  "id, created_at, campaign, latitude, longitude, device_type, location_source, gps_latitude, gps_longitude",
  "id, created_at, campaign, latitude, longitude, device_type, location_source",
  "id, created_at, campaign, latitude, longitude, device_type",
]

function emptyPayload(error?: string, spotsError: string | null = null): DownloadAnalyticsPayload {
  return {
    kpis: { today: 0, d7: 0, d30: 0, gps_pins: 0, ip_pins: 0, gps_geocode: 0, gps_only: 0, ip_place: 0 },
    pins: [],
    recentVisits: [],
    byCountry: [],
    clusters: [],
    posters: [],
    posterMarkers: [],
    spots: [],
    byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, scans: 0 })),
    daily: [],
    devices: [],
    error: error ?? null,
    spotsError,
  }
}

export async function GET() {
  try {
    const supabase = createAdminClient()
    const now = new Date()
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const todayStart = startOfTodayIst(now)

    const spotsRes = await supabase
      .from("campaign_spots")
      .select("campaign, label, latitude, longitude, notes, active")

    const spotsError = spotsRes.error?.message ?? null
    const spots = (spotsRes.data ?? []).map((s) => ({
      campaign: String(s.campaign),
      label: s.label as string | null,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      notes: (s.notes as string | null) ?? null,
      active: s.active !== false,
    }))
    const spotByCampaign = new Map(spots.filter((s) => s.active).map((s) => [s.campaign, s]))

    const rows: VisitRow[] = []
    let from = 0
    let selectIdx = 0
    while (from < MAX_ROWS) {
      const to = Math.min(from + PAGE - 1, MAX_ROWS - 1)
      const { data, error } = await supabase
        .from("download_link_visits")
        .select(VISIT_SELECTS[selectIdx])
        .gt("created_at", since30)
        .order("created_at", { ascending: false })
        .range(from, to)

      if (error && selectIdx < VISIT_SELECTS.length - 1) {
        selectIdx++
        continue
      }
      if (error) {
        return NextResponse.json(emptyPayload(error.message, spotsError))
      }
      const batch = (data ?? []) as unknown as VisitRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
      from += PAGE
    }

    const kpis = { today: 0, d7: 0, d30: rows.length, gps_pins: 0, ip_pins: 0, gps_geocode: 0, gps_only: 0, ip_place: 0 }
    const pins: DownloadVisitPin[] = []
    const clusterMap = new Map<string, { lat: number; lng: number; scans: number; sample_campaign: string | null }>()
    const posterMap = new Map<string, { scans: number; first_seen: string; last_seen: string }>()
    const ipSum = new Map<string, { lat: number; lng: number; n: number }>()
    const hourCounts = Array.from({ length: 24 }, () => 0)
    const dailyMap = new Map<string, number>()
    const deviceMap = new Map<string, number>()
    const countryMap = new Map<string, number>()
    const recentVisits: DownloadAnalyticsPayload["recentVisits"] = []

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

      const placeSrc = resolvePlaceSource(row.place_source, row.location_source)
      if (placeSrc === "gps_geocode") kpis.gps_geocode++
      else if (placeSrc === "gps_only") kpis.gps_only++
      else kpis.ip_place++

      const countryKey = row.country?.trim() || "—"
      countryMap.set(countryKey, (countryMap.get(countryKey) || 0) + 1)

      if (recentVisits.length < 100) {
        const src = row.location_source === "gps" ? "gps" : "ip"
        const rLat =
          src === "gps" && row.gps_latitude != null ? Number(row.gps_latitude) : row.latitude
        const rLng =
          src === "gps" && row.gps_longitude != null ? Number(row.gps_longitude) : row.longitude
        recentVisits.push({
          id: row.id,
          created_at: row.created_at,
          country: row.country,
          city: row.city,
          locality: row.locality,
          region: row.region,
          postal_code: row.postal_code,
          continent: row.continent,
          location_source: row.location_source,
          device_type: row.device_type,
          lat: rLat,
          lng: rLng,
          place_source: placeSrc,
        })
      }

      const src = row.location_source === "gps" ? "gps" : "ip"
      const lat =
        src === "gps" && row.gps_latitude != null ? Number(row.gps_latitude) : row.latitude
      const lng =
        src === "gps" && row.gps_longitude != null ? Number(row.gps_longitude) : row.longitude
      if (lat == null || lng == null) continue
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue

      if (src === "gps") kpis.gps_pins++
      else kpis.ip_pins++

      pins.push({
        id: row.id,
        created_at: row.created_at,
        campaign: row.campaign,
        lat,
        lng,
        device_type: row.device_type,
        location_source: src,
        country: row.country,
        city: row.city,
        locality: row.locality,
        region: row.region,
        postal_code: row.postal_code,
        continent: row.continent,
        place_source: placeSrc,
      })

      if (spot !== "(untagged QR)") {
        const sum = ipSum.get(spot) || { lat: 0, lng: 0, n: 0 }
        sum.lat += lat
        sum.lng += lng
        sum.n++
        ipSum.set(spot, sum)
      }

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
      .map(([spot, v]) => {
        const cfg = spotByCampaign.get(spot)
        return {
          spot,
          ...v,
          configured: !!cfg,
          label: cfg?.label ?? null,
        }
      })
      .sort((a, b) => b.scans - a.scans)

    const posterMarkers = spots
      .filter((s) => s.active)
      .map((s) => {
        const agg = posterMap.get(s.campaign)
        const ip = ipSum.get(s.campaign)
        return {
          campaign: s.campaign,
          label: s.label || s.campaign,
          lat: s.latitude,
          lng: s.longitude,
          scans: agg?.scans ?? 0,
          last_seen: agg?.last_seen ?? null,
          ip_centroid: ip && ip.n > 0 ? { lat: ip.lat / ip.n, lng: ip.lng / ip.n } : null,
        }
      })
      .sort((a, b) => b.scans - a.scans)

    const devices = [...deviceMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    const byCountry = [...countryMap.entries()]
      .map(([country, scans]) => ({ country, scans }))
      .sort((a, b) => b.scans - a.scans)

    return NextResponse.json({
      kpis,
      pins,
      recentVisits,
      byCountry,
      clusters,
      posters,
      posterMarkers,
      spots,
      byHour: hourCounts.map((scans, hour) => ({ hour, scans })),
      daily: [...dailyMap.entries()].map(([day, scans]) => ({ day, scans })),
      devices,
      error: null,
      spotsError,
    })
  } catch (err) {
    console.error("Download analytics fetch error:", err)
    return NextResponse.json(emptyPayload(err instanceof Error ? err.message : "Failed to load"), { status: 500 })
  }
}

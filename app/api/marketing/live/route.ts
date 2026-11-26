import { createAdminClient } from '@/lib/supabase/admin'
import { cityOf, countryName, resolveCountry } from '@/lib/geo'

export const dynamic = 'force-dynamic'

/** Time windows for the Live panel, in minutes. */
const WINDOWS: Record<string, number> = { '30m': 30, '1h': 60, '24h': 1440, '7d': 10080, '30d': 43200, '90d': 129600 }

type Coord = { lat: number; lng: number }
let coords: { at: number; city: Map<string, Coord>; country: Map<string, Coord> } | null = null

async function pagedRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await createAdminClient().rpc(fn, args ?? {}).range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

// City/country coordinates learned from landing-visit geo, refreshed hourly.
async function coordTable() {
  if (coords && Date.now() - coords.at < 3600_000) return coords
  const data = await pagedRpc<{ country: string; city: string | null; lat: number; lng: number; n: number }>('marketing_city_coords')
  const city = new Map<string, Coord>(), country = new Map<string, Coord>()
  const best = new Map<string, number>()
  for (const r of data) {
    if (!r.city) { country.set(r.country, { lat: r.lat, lng: r.lng }); continue }
    const name = cityOf(r.city)
    if (!name) continue
    const key = `${r.country}|${name.toLowerCase()}`
    if ((best.get(key) ?? 0) < r.n) { best.set(key, r.n); city.set(key, { lat: r.lat, lng: r.lng }) }
  }
  coords = { at: Date.now(), city, country }
  return coords
}

/** Who was active in the window: the accurate active-users feed for 30 min, else swipes/profile writes. */
async function activeUserIds(req: Request, minutes: number, since: string): Promise<string[]> {
  if (minutes <= 30) {
    const r = await fetch(new URL('/api/overview/active-users', req.url), { cache: 'no-store' }).then(x => x.json()).catch(() => ({ users: [] }))
    return ((r?.users ?? []) as { id: string }[]).map(u => u.id)
  }
  return (await pagedRpc<{ user_id: string }>('marketing_active_users', { p_since: since })).map(r => r.user_id)
}

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams
    const key = sp.get('window') || '30m'
    const withUsers = sp.get('users') !== '0'
    const minutes = WINDOWS[key] ?? 30
    const since = new Date(Date.now() - minutes * 60_000).toISOString()
    const db = createAdminClient()

    const [ids, visitGeo, visitPts, latestRes, table] = await Promise.all([
      withUsers ? activeUserIds(req, minutes, since) : Promise.resolve([] as string[]),
      pagedRpc<{ lat: number; lng: number; country: string | null; city: string | null; n: number }>('marketing_visits_geo', { p_since: since }),
      pagedRpc<{ lat: number; lng: number; gps: boolean }>('marketing_visit_points', { p_since: since }),
      db.rpc('marketing_live_visitors', { p_minutes: minutes }),
      coordTable(),
    ])

    // Locations of the active users, in chunks (the list can be long for 90 days).
    const profs: { id: string; location: string | null; country_code: string | null }[] = []
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await db.from('profiles').select('id, location, country_code').in('id', ids.slice(i, i + 300))
      if (error) throw new Error(error.message)
      profs.push(...(data ?? []))
    }

    const byCountry = new Map<string, number>()
    const userDots = new Map<string, { lat: number; lng: number; n: number }>()
    const userPoints: { lat: number; lng: number }[] = []
    // Small, stable spread around the city so several people there read as a cluster.
    const jitter = (seed: string, k: number) => { let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0; return (((h >>> k) % 1000) / 1000 - 0.5) * 0.6 }
    for (const p of profs) {
      const code = resolveCountry(p.location, p.country_code)
      if (code) byCountry.set(code, (byCountry.get(code) ?? 0) + 1)
      const city = cityOf(p.location)
      const c = (code && city && table.city.get(`${code}|${city.toLowerCase()}`)) || (code && table.country.get(code)) || null
      if (!c) continue
      userPoints.push({ lat: c.lat + jitter(p.id, 3), lng: c.lng + jitter(p.id, 13) })
      const k = `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`
      const d = userDots.get(k) ?? { lat: c.lat, lng: c.lng, n: 0 }
      d.n++
      userDots.set(k, d)
    }

    return Response.json({
      window: key,
      activeUsers: ids.length,
      userDots: [...userDots.values()],
      visits: visitGeo.reduce((s, v) => s + Number(v.n), 0),
      visitDots: visitGeo.map(v => ({ lat: v.lat, lng: v.lng, n: Number(v.n) })),
      visitPoints: visitPts,
      userPoints,
      latest: (latestRes.data ?? []).slice(0, 12),
      byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, name: countryName(code), n })),
      generatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('marketing live', err)
    return Response.json({ error: 'Could not load live users.' }, { status: 500 })
  }
}

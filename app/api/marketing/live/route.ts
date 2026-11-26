import { createAdminClient } from '@/lib/supabase/admin'
import { cityOf, countryName, resolveCountry } from '@/lib/geo'

export const dynamic = 'force-dynamic'

type Coord = { lat: number; lng: number }
let coords: { at: number; city: Map<string, Coord>; country: Map<string, Coord> } | null = null

// City/country coordinates learned from landing-visit geo, refreshed hourly.
async function coordTable() {
  if (coords && Date.now() - coords.at < 3600_000) return coords
  const data: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await createAdminClient().rpc('marketing_city_coords').range(from, from + 999)
    if (error) throw new Error(error.message)
    data.push(...(page ?? []))
    if (!page || page.length < 1000) break
  }
  const city = new Map<string, Coord>(), country = new Map<string, Coord>()
  const best = new Map<string, number>()
  for (const r of data as { country: string; city: string | null; lat: number; lng: number; n: number }[]) {
    if (!r.city) { country.set(r.country, { lat: r.lat, lng: r.lng }); continue }
    const name = cityOf(r.city)
    if (!name) continue
    const key = `${r.country}|${name.toLowerCase()}`
    if ((best.get(key) ?? 0) < r.n) { best.set(key, r.n); city.set(key, { lat: r.lat, lng: r.lng }) }
  }
  coords = { at: Date.now(), city, country }
  return coords
}

export async function GET(req: Request) {
  try {
    const db = createAdminClient()
    const [activeRes, visitorsRes, table] = await Promise.all([
      fetch(new URL('/api/overview/active-users', req.url), { cache: 'no-store' }).then(r => r.json()).catch(() => ({ users: [] })),
      db.rpc('marketing_live_visitors', { p_minutes: 30 }),
      coordTable(),
    ])
    const active = ((activeRes?.users ?? []) as { id: string; name: string; activeNow: boolean }[]).filter(u => u.activeNow)
    const ids = active.map(u => u.id)
    const { data: profs } = ids.length
      ? await db.from('profiles').select('id, location, country_code').in('id', ids)
      : { data: [] as { id: string; location: string | null; country_code: string | null }[] }
    const profById = new Map((profs ?? []).map(p => [p.id, p]))

    const byCountry = new Map<string, number>()
    const users = active.map(u => {
      const p = profById.get(u.id)
      const code = resolveCountry(p?.location, p?.country_code)
      const city = cityOf(p?.location)
      if (code) byCountry.set(code, (byCountry.get(code) ?? 0) + 1)
      const c = (code && city && table.city.get(`${code}|${city.toLowerCase()}`)) || (code && table.country.get(code)) || null
      return { name: u.name, code, city, lat: c?.lat ?? null, lng: c?.lng ?? null }
    })
    const visitors = ((visitorsRes.data ?? []) as { lat: number; lng: number; country: string | null; city: string | null; host: string; at: string }[])

    return Response.json({
      activeNow: active.length,
      users,
      visitors,
      byCountry: [...byCountry.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, name: countryName(code), n })),
      generatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('marketing live', err)
    return Response.json({ error: 'Could not load live users.' }, { status: 500 })
  }
}

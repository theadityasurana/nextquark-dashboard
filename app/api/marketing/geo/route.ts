import { createAdminClient } from '@/lib/supabase/admin'
import { cachedRoute } from '@/lib/server-cache'
import { WORLD_COUNTRIES, cityOf, countryName, resolveCountry } from '@/lib/geo'

export const dynamic = 'force-dynamic'

// "irisjobs.live", "nextquark.in." → "nextquark.in", Cloudflare preview builds grouped, blanks labelled.
function cleanHost(h: string | null): string {
  const v = String(h || '').trim().toLowerCase().replace(/^["'\s]+|["'\s]+$/g, '').replace(/\.+$/, '').replace(/^www\./, '')
  if (!v || v === '—' || !v.includes('.')) return 'Not recorded'
  if (v.endsWith('.pages.dev')) return 'Preview builds (pages.dev)'
  return v
}

type SourceRow = { source: string; host: string; campaign: string | null; country: string | null; city: string | null; visits: number }

async function load(range: string) {
  const db = createAdminClient()
  const since = range === 'all' ? new Date('2020-01-01') : new Date(Date.now() - 30 * 86400_000)

  // Users (profiles) by country and city.
  const profiles: { location: string | null; country_code: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    let q = db.from('profiles').select('location, country_code').order('id').range(from, from + 999)
    if (range !== 'all') q = q.gte('created_at', since.toISOString())
    const { data, error } = await q
    if (error) throw new Error(error.message)
    profiles.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const byCountry = new Map<string, number>()
  const byCity = new Map<string, { city: string; code: string | null; users: number }>()
  let located = 0
  for (const p of profiles) {
    const code = resolveCountry(p.location, p.country_code)
    if (code) { located++; byCountry.set(code, (byCountry.get(code) ?? 0) + 1) }
    const city = cityOf(p.location)
    if (city) {
      const key = `${code ?? ''}|${city.toLowerCase()}`
      const e = byCity.get(key) ?? { city, code, users: 0 }
      e.users++
      byCity.set(key, e)
    }
  }

  // Landing-page traffic by source, domain, campaign and place.
  // The database answers at most 1000 rows per call, so page through.
  const rows: SourceRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.rpc('marketing_visit_sources', { p_since: since.toISOString() }).range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as SourceRow[]))
    if (!data || data.length < 1000) break
  }
  const sources = new Map<string, { visits: number; places: Map<string, { city: string | null; country: string | null; visits: number }>; countries: Map<string, number> }>()
  const domains = new Map<string, number>(), campaigns = new Map<string, number>(), visitCountries = new Map<string, number>()
  let totalVisits = 0
  for (const r of rows) {
    const v = Number(r.visits) || 0
    totalVisits += v
    const s = sources.get(r.source) ?? { visits: 0, places: new Map(), countries: new Map() }
    s.visits += v
    const pk = `${r.country ?? ''}|${r.city ?? ''}`
    const pl = s.places.get(pk) ?? { city: r.city, country: r.country, visits: 0 }
    pl.visits += v
    s.places.set(pk, pl)
    if (r.country) s.countries.set(r.country, (s.countries.get(r.country) ?? 0) + v)
    sources.set(r.source, s)
    const host = cleanHost(r.host)
    domains.set(host, (domains.get(host) ?? 0) + v)
    if (r.campaign) campaigns.set(r.campaign, (campaigns.get(r.campaign) ?? 0) + v)
    if (r.country) visitCountries.set(r.country, (visitCountries.get(r.country) ?? 0) + v)
  }
  const top = <T,>(m: Map<string, T>, score: (t: T) => number, n: number) => [...m.entries()].sort((a, b) => score(b[1]) - score(a[1])).slice(0, n)

  return {
    range,
    totalUsers: profiles.length,
    located,
    countriesCount: byCountry.size,
    worldCountries: WORLD_COUNTRIES,
    countries: top(byCountry, v => v, 60).map(([code, users]) => ({ code, name: countryName(code), users })),
    cities: [...byCity.values()].sort((a, b) => b.users - a.users).slice(0, 40),
    totalVisits,
    visitCountriesCount: visitCountries.size,
    sources: top(sources, s => s.visits, 20).map(([source, s]) => ({
      source, visits: s.visits,
      countries: s.countries.size,
      topPlaces: top(s.places, p => p.visits, 4).map(([, p]) => p),
    })),
    domains: top(domains, v => v, 15).map(([host, visits]) => ({ host, visits })),
    campaigns: top(campaigns, v => v, 15).map(([campaign, visits]) => ({ campaign, visits })),
  }
}

export function GET(req: Request) {
  const range = new URL(req.url).searchParams.get('range') === 'all' ? 'all' : '30d'
  return cachedRoute(req, 120_000, async () => {
    try { return Response.json(await load(range)) }
    catch (err) { console.error('marketing geo', err); return Response.json({ error: 'Could not load geography.' }, { status: 500 }) }
  })
}

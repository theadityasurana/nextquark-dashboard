import { cachedRoute } from "@/lib/server-cache"
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const RANGES: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
const IST_OFFSET_MS = 5.5 * 3_600_000

type Row = { status: string; company_name: string | null; created_at: string; user_id: string | null }

/**
 * GET /api/analytics?range=7d|30d|90d → aggregates for the Overview › Analytics tab.
 * All counting happens here; the browser gets totals and series, not rows.
 * (The old version shipped up to "5000" rows — silently cut to 1000 by
 * PostgREST — so "Applications" stuck at 1000 and the charts undercounted.)
 */
async function load(request: Request) {
  try {
    const supabase = createAdminClient()
    const rangeKey = new URL(request.url).searchParams.get('range') || '30d'
    const days = RANGES[rangeKey] ?? 30
    const since = new Date(Date.now() - days * 86_400_000)
    const sinceIso = since.toISOString()

    const rows: Row[] = []
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await supabase
        .from('live_application_queue')
        .select('status, company_name, created_at, user_id')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + 999)
      if (error) throw new Error(error.message)
      rows.push(...((data ?? []) as Row[]))
      if (!data || data.length < 1000) break
    }

    const [jobsTotal, jobsNew] = await Promise.all([
      supabase.from('jobs').select('id', { count: 'estimated', head: true }),
      supabase.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso),
    ])

    // Daily series in IST, every day present even when empty.
    const dayKey = (iso: string) => new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
    const daily = new Map<string, { date: string; completed: number; failed: number; other: number }>()
    for (let i = days - 1; i >= 0; i--) {
      const k = dayKey(new Date(Date.now() - i * 86_400_000).toISOString())
      daily.set(k, { date: k, completed: 0, failed: 0, other: 0 })
    }
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }))
    const status: Record<string, number> = {}
    const companies = new Map<string, { name: string; total: number; completed: number; failed: number }>()
    const users = new Set<string>()

    for (const r of rows) {
      status[r.status] = (status[r.status] ?? 0) + 1
      const d = daily.get(dayKey(r.created_at))
      if (d) {
        if (r.status === 'completed') d.completed++
        else if (r.status === 'failed') d.failed++
        else d.other++
      }
      const istHour = new Date(new Date(r.created_at).getTime() + IST_OFFSET_MS).getUTCHours()
      hours[istHour].count++
      if (r.user_id) users.add(r.user_id)
      if (r.company_name) {
        const c = companies.get(r.company_name) ?? { name: r.company_name, total: 0, completed: 0, failed: 0 }
        c.total++
        if (r.status === 'completed') c.completed++
        if (r.status === 'failed') c.failed++
        companies.set(r.company_name, c)
      }
    }

    const completed = status.completed ?? 0
    const failed = status.failed ?? 0
    return NextResponse.json({
      range: rangeKey,
      totals: {
        applications: rows.length,
        completed,
        failed,
        successRate: completed + failed > 0 ? Math.round((completed / (completed + failed)) * 1000) / 10 : 0,
        applicants: users.size,
        companies: companies.size,
        jobsListed: jobsTotal.count ?? 0,
        jobsAdded: jobsNew.count ?? 0,
      },
      status,
      daily: [...daily.values()],
      hours,
      topCompanies: [...companies.values()].sort((a, b) => b.total - a.total).slice(0, 12),
    })
  } catch (err) {
    console.error('Analytics fetch error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load analytics' }, { status: 500 })
  }
}

export function GET(request: Request) {
  return cachedRoute(request, 120_000, () => load(request))
}

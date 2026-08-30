import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createAdminClient()

    const [{ count: jobCount }, appsRes] = await Promise.all([
      supabase.from('jobs').select('*', { count: 'exact', head: true }),
      supabase.from('live_application_queue').select('job_id, company_name, status, created_at').limit(5000),
    ])

    const rawApps = appsRes.data || []

    const appsByJob = new Map<string, { total: number; completed: number }>()
    for (const a of rawApps) {
      if (!a.job_id) continue
      const cur = appsByJob.get(a.job_id) || { total: 0, completed: 0 }
      cur.total++
      if (a.status === 'completed') cur.completed++
      appsByJob.set(a.job_id, cur)
    }

    const applications = rawApps.map((a: any) => ({
      id: a.id,
      job_id: a.job_id,
      company_name: a.company_name || '',
      status: a.status,
      created_at: a.created_at,
    }))

    return NextResponse.json({ jobCount: jobCount ?? 0, applications })
  } catch (err) {
    console.error('Analytics fetch error:', err)
    return NextResponse.json({ jobs: [], applications: [] }, { status: 500 })
  }
}

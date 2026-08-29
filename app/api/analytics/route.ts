import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'

// Analytics data changes slowly — cache for 60 seconds.
// Right swipe counts and success rates only update when applications complete.
const getCachedAnalytics = unstable_cache(
  async () => {
    const supabase = createAdminClient()

    const [jobsRes, appsRes] = await Promise.all([
      // Only the columns the analytics screen actually renders
      supabase
        .from('jobs')
        .select('id, company_id, company_name, company_initial, title, location, right_swipes, success_rate, total_apps, created_at'),
      supabase
        .from('live_application_queue')
        .select('id, job_id, company_id, company_name, status, created_at'),
    ])

    if (jobsRes.error) console.error('Analytics jobs error:', jobsRes.error)
    if (appsRes.error) console.error('Analytics apps error:', appsRes.error)

    return {
      jobs: jobsRes.data || [],
      applications: appsRes.data || [],
    }
  },
  ['analytics-data'],
  { revalidate: 60 }
)

export async function GET() {
  try {
    const data = await getCachedAnalytics()
    return NextResponse.json(data)
  } catch (err) {
    console.error('Analytics fetch error:', err)
    return NextResponse.json({ jobs: [], applications: [] }, { status: 500 })
  }
}

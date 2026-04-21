import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = getAdminClient()

  const [jobsRes, appsRes] = await Promise.all([
    supabase
      .from("jobs")
      .select("*"),
    supabase
      .from("live_application_queue")
      .select("id, job_id, company_id, company_name, status, created_at"),
  ])

  if (jobsRes.error) {
    console.error('Analytics jobs error:', jobsRes.error)
    return NextResponse.json({ jobs: [], applications: [] })
  }

  if (appsRes.error) {
    console.error('Analytics apps error:', appsRes.error)
    // Still return jobs even if apps fail
    return NextResponse.json({
      jobs: jobsRes.data || [],
      applications: [],
    })
  }

  return NextResponse.json({
    jobs: jobsRes.data || [],
    applications: appsRes.data || [],
  })
}

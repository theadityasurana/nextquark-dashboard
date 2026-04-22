import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    const body = await request.json().catch(() => ({}))
    const { preview } = body

    // Get all companies with ATS integration
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, ats_type, ats_company_id, logo_initial")
      .not("ats_type", "is", null)
      .not("ats_company_id", "is", null)

    if (!companies || companies.length === 0) {
      return NextResponse.json({ staleJobs: [], message: "No companies with ATS integration found" })
    }

    const origin = new URL(request.url).origin

    // For each ATS company, fetch live job URLs and compare with DB
    const allStaleJobs: any[] = []

    for (const company of companies) {
      try {
        // Fetch live jobs from ATS via the existing preview endpoint
        const res = await fetch(`${origin}/api/ats-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: company.id,
            atsType: company.ats_type,
            atsCompanyId: company.ats_company_id,
            preview: true,
          }),
        })
        const data = await res.json()
        const liveJobUrls = new Set(
          (data.jobs || []).map((j: any) => j.jobUrl).filter(Boolean)
        )

        // Get all DB jobs for this company that have a job_url
        const { data: dbJobs } = await supabase
          .from("jobs")
          .select("id, title, job_url, company_name, location, type")
          .eq("company_id", company.id)
          .not("job_url", "is", null)
          .neq("job_url", "")

        for (const dbJob of dbJobs || []) {
          if (!liveJobUrls.has(dbJob.job_url)) {
            allStaleJobs.push({
              id: dbJob.id,
              title: dbJob.title,
              jobUrl: dbJob.job_url,
              companyName: dbJob.company_name || company.name,
              location: dbJob.location,
              type: dbJob.type,
            })
          }
        }
      } catch (err) {
        console.error(`Cleanup check error for ${company.name}:`, err)
      }
    }

    if (preview) {
      return NextResponse.json({ staleJobs: allStaleJobs, totalFound: allStaleJobs.length })
    }

    // Delete stale jobs
    if (allStaleJobs.length === 0) {
      return NextResponse.json({ deletedCount: 0, message: "No stale jobs found" })
    }

    const idsToDelete = allStaleJobs.map((j) => j.id)
    const { error } = await supabase.from("jobs").delete().in("id", idsToDelete)

    if (error) {
      console.error("Error deleting stale jobs:", error)
      return NextResponse.json({ error: "Failed to delete stale jobs" }, { status: 500 })
    }

    return NextResponse.json({
      deletedCount: idsToDelete.length,
      message: `Deleted ${idsToDelete.length} jobs that no longer exist on company portals`,
    })
  } catch (error) {
    console.error("Cleanup error:", error)
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 })
  }
}

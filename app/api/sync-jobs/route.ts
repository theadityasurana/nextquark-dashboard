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
    const body = await request.json()
    const companyId = body.companyId

    let companies
    if (companyId) {
      // Sync specific company
      const { data } = await supabase.from("companies").select("id, name, logo_initial, website, linkedin_url, careers_url").eq("id", companyId)
      companies = data
    } else {
      // Sync all companies
      const { data } = await supabase.from("companies").select("id, name, logo_initial, website, linkedin_url, careers_url").not("careers_url", "is", null)
      companies = data
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ companiesChecked: 0, addedCount: 0 })
    }

    let addedCount = 0

    for (const company of companies) {
      try {
        const scrapeRes = await fetch(new URL(request.url).origin + "/api/scraper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portalUrl: company.careers_url }),
        })

        const { jobs: scrapedJobs } = await scrapeRes.json()

        const { data: existingJobs } = await supabase
          .from("jobs")
          .select("job_url")
          .eq("company_id", company.id)

        const existingUrls = new Set(existingJobs?.map((j) => j.job_url).filter(Boolean) || [])

        for (const job of scrapedJobs || []) {
          if (job.jobUrl && !existingUrls.has(job.jobUrl)) {
            const jobId = `${company.logo_initial}-${String(Math.floor(Math.random() * 999)).padStart(3, "0")}`

            const { error: insertError } = await supabase.from("jobs").insert({
              id: jobId,
              company_id: company.id,
              company_name: company.name || "Unknown",
              company_initial: company.logo_initial || "?",
              title: job.title || "Untitled Position",
              location: job.location || "Remote",
              type: job.type || "Full-time",
              salary_range: job.salaryMin && job.salaryMax ? `${job.salaryMin} - ${job.salaryMax}` : "Not specified",
              experience: job.experience || "Not specified",
              portal_url: company.careers_url || "",
              job_url: job.jobUrl || "",
              company_website: company.website || null,
              company_linkedin: company.linkedin_url || null,
              status: "queued",
              total_apps: 0,
              right_swipes: 0,
              success_rate: 0,
              avg_time: "-",
              posted_at: new Date().toISOString().split("T")[0],
              description: job.description || "",
              requirements: job.requirements || [],
              skills: job.skills || [],
              benefits: job.benefits || [],
              detailed_requirements: job.detailedRequirements || "",
              education_level: job.educationLevel || null,
              work_authorization: job.workAuthorization || null,
            })

            if (insertError) {
              console.error(`Error inserting job:`, insertError)
              continue
            }

            addedCount++
          }
        }
      } catch (err) {
        console.error(`Error syncing jobs for ${company.name}:`, err)
      }
    }

    return NextResponse.json({ companiesChecked: companies.length, addedCount })
  } catch (error) {
    console.error("Sync error:", error)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}

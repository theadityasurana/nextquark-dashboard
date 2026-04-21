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
    const { preview, selectedJobUrls } = body

    // Get all companies with ATS integration
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, ats_type, ats_company_id, logo_initial")
      .not("ats_type", "is", null)
      .not("ats_company_id", "is", null)

    if (!companies || companies.length === 0) {
      return NextResponse.json({
        companiesChecked: 0,
        totalAdded: 0,
        message: "No companies with ATS integration found",
      })
    }

    const origin = new URL(request.url).origin

    // Preview mode: fetch all jobs from all ATS companies without saving
    if (preview) {
      const allPreviewJobs: any[] = []

      for (const company of companies) {
        try {
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
          if (data.jobs) {
            for (const job of data.jobs) {
              allPreviewJobs.push({
                ...job,
                companyId: company.id,
                companyName: company.name,
                companyInitial: company.logo_initial,
                atsType: company.ats_type,
                atsCompanyId: company.ats_company_id,
              })
            }
          }
        } catch (err) {
          console.error(`Preview error for ${company.name}:`, err)
        }
      }

      return NextResponse.json({
        preview: true,
        jobs: allPreviewJobs,
        totalFound: allPreviewJobs.length,
        companiesChecked: companies.length,
      })
    }

    // Confirm mode: sync selected jobs per company
    let totalAdded = 0
    let totalUpdated = 0
    const results: any[] = []

    // Group selectedJobUrls by company
    const urlsByCompany = new Map<string, string[]>()
    if (selectedJobUrls && Array.isArray(selectedJobUrls)) {
      // selectedJobUrls is array of { companyId, jobUrl }
      for (const item of selectedJobUrls) {
        const list = urlsByCompany.get(item.companyId) || []
        list.push(item.jobUrl)
        urlsByCompany.set(item.companyId, list)
      }
    }

    const companiesToSync = selectedJobUrls
      ? companies.filter((c) => urlsByCompany.has(c.id))
      : companies

    for (const company of companiesToSync) {
      try {
        const syncBody: any = {
          companyId: company.id,
          atsType: company.ats_type,
          atsCompanyId: company.ats_company_id,
        }
        if (urlsByCompany.has(company.id)) {
          syncBody.selectedJobUrls = urlsByCompany.get(company.id)
        }

        const syncRes = await fetch(`${origin}/api/ats-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(syncBody),
        })

        const data = await syncRes.json()
        totalAdded += data.addedCount || 0
        totalUpdated += data.updatedCount || 0
        results.push({
          company: company.name,
          added: data.addedCount || 0,
          updated: data.updatedCount || 0,
          total: data.totalFound || 0,
        })
      } catch (err) {
        console.error(`Error syncing ${company.name}:`, err)
        results.push({ company: company.name, error: "Failed to sync" })
      }
    }

    return NextResponse.json({
      companiesChecked: companiesToSync.length,
      totalAdded,
      totalUpdated,
      results,
      message: `Added ${totalAdded} new jobs, updated ${totalUpdated} existing jobs across ${companiesToSync.length} companies`,
    })
  } catch (error) {
    console.error("Bulk sync error:", error)
    return NextResponse.json({ error: "Bulk sync failed" }, { status: 500 })
  }
}

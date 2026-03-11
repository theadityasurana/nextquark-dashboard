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

    // Get all companies with ATS integration
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, ats_type, ats_company_id")
      .not("ats_type", "is", null)
      .not("ats_company_id", "is", null)

    if (!companies || companies.length === 0) {
      return NextResponse.json({ 
        companiesChecked: 0, 
        totalAdded: 0,
        message: "No companies with ATS integration found" 
      })
    }

    let totalAdded = 0
    const results = []

    // Sync each company
    for (const company of companies) {
      try {
        const syncRes = await fetch(new URL(request.url).origin + "/api/ats-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: company.id,
            atsType: company.ats_type,
            atsCompanyId: company.ats_company_id,
          }),
        })

        const data = await syncRes.json()
        
        if (data.addedCount) {
          totalAdded += data.addedCount
          results.push({
            company: company.name,
            added: data.addedCount,
            total: data.totalFound,
          })
        }
      } catch (err) {
        console.error(`Error syncing ${company.name}:`, err)
        results.push({
          company: company.name,
          error: "Failed to sync",
        })
      }
    }

    return NextResponse.json({
      companiesChecked: companies.length,
      totalAdded,
      results,
      message: `Synced ${companies.length} companies, added ${totalAdded} new jobs`,
    })
  } catch (error) {
    console.error("Bulk sync error:", error)
    return NextResponse.json({ error: "Bulk sync failed" }, { status: 500 })
  }
}

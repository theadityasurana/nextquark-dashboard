import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(request.url)
  
  const page = parseInt(searchParams.get("page") || "1")
  const limit = parseInt(searchParams.get("limit") || "12")
  const all = searchParams.get("all") === "true"
  const from = (page - 1) * limit

  let query = supabase
    .from("companies")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })

  if (!all) {
    query = query.range(from, from + limit - 1)
  }

  const { data, error, count } = await query

  if (error) {
    console.log("[v0] GET /api/companies error:", error.message)
    return NextResponse.json({ data: [], total: 0 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ data: [], total: count || 0 })
  }

  // Get job counts for all companies using individual count queries (avoids 1000 row limit)
  const countMap = new Map<string, number>()
  await Promise.all(
    data.map(async (company) => {
      const { count: jobCount } = await supabase
        .from("jobs")
        .select("*", { count: "exact", head: true })
        .eq("company_id", company.id)
      countMap.set(company.id, jobCount || 0)
    })
  )

  const companiesWithJobCounts = data.map(company => ({
    ...company,
    total_jobs: countMap.get(company.id) || 0
  }))

  return NextResponse.json({ data: companiesWithJobCounts, total: count || 0 })
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: body.name,
      logo_initial: body.name?.charAt(0)?.toUpperCase() || "C",
      logo_url: body.logo_url || null,
      website: body.website || "",
      careers_url: body.careers_url || "",
      linkedin_url: body.linkedin_url || null,
      description: body.description || null,
      industry: body.industry || "Technology",
      size: body.size || "Unknown",
      location: Array.isArray(body.location) ? body.location : [body.location || "Remote"],
      portal_type: body.portal_type || "Custom",
      benefits: Array.isArray(body.benefits) ? body.benefits : [],
      company_type: body.company_type || "Other",
      ats_type: body.ats_type || null,
      ats_company_id: body.ats_company_id || null,
      portal_status: "active",
      total_jobs: 0,
      apps_today: 0,
      success_rate: 0,
      avg_time: "-",
      added_at: new Date().toISOString().split("T")[0],
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  // Get company name before deleting (needed for tables that reference by name)
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", id)
    .single()

  // Get all job IDs for this company (needed for queue cleanup)
  const { data: companyJobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("company_id", id)

  // Delete from live_application_queue (references job_id FK + company_id)
  if (companyJobs && companyJobs.length > 0) {
    const jobIds = companyJobs.map((j) => j.id)
    await supabase.from("live_application_queue").delete().in("job_id", jobIds)
  }
  await supabase.from("live_application_queue").delete().eq("company_id", id)

  // Delete from performance_metrics (references company_name)
  if (company?.name) {
    await supabase.from("performance_metrics").delete().eq("company_name", company.name)
  }

  // Delete company (jobs cascade automatically via FK)
  const { error } = await supabase.from("companies").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
  const supabase = getAdminClient()
  const body = await request.json()
  const { id, ...updates } = body

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.log("[v0] GET /api/jobs error:", error.message)
    // Return empty array if table doesn't exist yet
    return NextResponse.json([])
  }

  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient()
  const body = await request.json()

  console.log("[v0] POST /api/jobs body:", JSON.stringify(body, null, 2))

  const initial = body.company_initial || "J"
  const randomNum = String(Math.floor(Math.random() * 999)).padStart(3, "0")
  const jobId = `${initial}-${randomNum}`

  // Ensure company_id is a valid UUID or null
  const companyId = body.company_id && body.company_id.length > 0 ? body.company_id : null

  const insertData: Record<string, unknown> = {
    id: jobId,
    company_id: companyId,
    company_name: body.company_name || "Unknown",
    company_initial: body.company_initial || "",
    title: body.title,
    location: body.location || "Remote",
    type: body.type || "Full-time",
    salary_range: body.salary_range || "Not specified",
    experience: body.experience || "Not specified",
    portal_url: body.portal_url || "",
    job_url: body.job_url || "",
    company_website: body.company_website || null,
    company_linkedin: body.company_linkedin || null,
    status: "queued",
    total_apps: 0,
    right_swipes: 0,
    success_rate: 0,
    avg_time: "-",
    posted_at: new Date().toISOString().split("T")[0],
    description: body.description || "",
    requirements: body.requirements || [],
    skills: body.skills || [],
    benefits: body.benefits || [],
    detailed_requirements: body.detailed_requirements || "",
    education_level: body.education_level || null,
    work_authorization: body.work_authorization || null,
  }

  console.log("[v0] Inserting job with portal_url:", insertData.portal_url, "job_url:", insertData.job_url)

  const { data, error } = await supabase
    .from("jobs")
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.log("[v0] Job insert error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log("[v0] Job inserted successfully:", JSON.stringify(data, null, 2))

  // Update the company's total_jobs count
  if (companyId) {
    const { data: companyData } = await supabase
      .from("companies")
      .select("total_jobs")
      .eq("id", companyId)
      .single()

    if (companyData) {
      await supabase
        .from("companies")
        .update({ total_jobs: (companyData.total_jobs || 0) + 1 })
        .eq("id", companyId)
    }
  }

  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const supabase = getAdminClient()
  const body = await request.json()
  const { id, ...updates } = body

  console.log("[v0] PATCH /api/jobs id:", id, "updates:", JSON.stringify(updates, null, 2))

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  // Map camelCase frontend keys to snake_case DB columns
  const dbUpdates: Record<string, unknown> = {}
  const keyMap: Record<string, string> = {
    title: "title",
    location: "location",
    type: "type",
    salary_range: "salary_range",
    experience: "experience",
    portal_url: "portal_url",
    job_url: "job_url",
    company_website: "company_website",
    company_linkedin: "company_linkedin",
    status: "status",
    description: "description",
    requirements: "requirements",
    skills: "skills",
    benefits: "benefits",
    detailed_requirements: "detailed_requirements",
    education_level: "education_level",
    work_authorization: "work_authorization",
  }

  for (const [key, value] of Object.entries(updates)) {
    if (key in keyMap) {
      dbUpdates[keyMap[key]] = value
    }
  }

  console.log("[v0] PATCH dbUpdates:", JSON.stringify(dbUpdates, null, 2))

  if (Object.keys(dbUpdates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("jobs")
    .update(dbUpdates)
    .eq("id", id)
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

  const { error } = await supabase.from("jobs").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

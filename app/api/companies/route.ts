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
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.log("[v0] GET /api/companies error:", error.message)
    return NextResponse.json([])
  }

  return NextResponse.json(data || [])
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

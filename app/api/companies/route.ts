import { cachedValue, invalidateCached } from "@/lib/server-cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"

const getAdminClient = createAdminClient

const PAGE = 1000

/** company_id → open job count, one row per company. Paged (PostgREST caps at 1000) and cached. */
function jobCountMap(supabase: ReturnType<typeof getAdminClient>) {
  return cachedValue("company-job-counts", 5 * 60_000, async () => {
    const rows: { company_id: string; job_count: number }[] = []
    for (let start = 0; start < 100_000; start += PAGE) {
      const { data, error } = await supabase.rpc("company_job_counts").range(start, start + PAGE - 1)
      if (error) throw new Error(error.message)
      rows.push(...((data ?? []) as { company_id: string; job_count: number }[]))
      if (!data || data.length < PAGE) break
    }
    return new Map(rows.map((r) => [r.company_id, Number(r.job_count)]))
  }).catch((err) => {
    console.error("[companies] job counts failed:", err.message)
    return new Map<string, number>()
  })
}

/**
 * GET /api/companies
 *   ?page=1&limit=25&q=acme   one page of full rows (default; limit capped at 100)
 *   ?stats=1                  header counts only (no rows)
 *   ?lite=1                   id/name/logo for every company — dropdowns and name lookups
 *
 * There is deliberately no "give me every full row" mode any more: that shipped
 * ~2.7k wide rows to every page load of the dashboard.
 */
export async function GET(request: NextRequest) {
  const supabase = getAdminClient()
  const { searchParams } = new URL(request.url)

  if (searchParams.get("stats") === "1") {
    const stats = await cachedValue("company-stats", 60_000, async () => {
      const head = () => supabase.from("companies").select("id", { count: "exact", head: true })
      const [total, ats, failed, jobs] = await Promise.all([
        head(),
        head().not("ats_type", "is", null),
        head().eq("sync_status", "failed"),
        supabase.from("jobs").select("id", { count: "estimated", head: true }),
      ])
      const err = total.error || ats.error || failed.error
      if (err) throw new Error(err.message)
      return { total: total.count ?? 0, atsLinked: ats.count ?? 0, syncFailures: failed.count ?? 0, jobsTracked: jobs.count ?? 0 }
    }).catch((e: Error) => ({ error: e.message }))
    if ("error" in stats) return NextResponse.json(stats, { status: 500 })
    return NextResponse.json(stats)
  }

  if (searchParams.get("lite") === "1") {
    try {
      const rows = await cachedValue("companies-lite", 5 * 60_000, async () => {
        const out: Record<string, unknown>[] = []
        for (let start = 0; start < 100_000; start += PAGE) {
          const { data, error } = await supabase
            .from("companies")
            .select("id, name, logo_url, logo_initial")
            .order("name", { ascending: true })
            .order("id", { ascending: true })
            .range(start, start + PAGE - 1)
          if (error) throw new Error(error.message)
          out.push(...(data ?? []))
          if (!data || data.length < PAGE) break
        }
        return out
      })
      return NextResponse.json({ data: rows, total: rows.length })
    } catch (e) {
      return NextResponse.json({ data: [], total: 0, error: (e as Error).message }, { status: 500 })
    }
  }

  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25") || 25))
  const q = (searchParams.get("q") || "").trim()
  const from = (page - 1) * limit

  let query = supabase
    .from("companies")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + limit - 1)
  if (q) query = query.ilike("name", `%${q.replace(/[%_,()]/g, " ")}%`)

  const { data, error, count } = await query
  if (error) {
    console.error("GET /api/companies error:", error.message)
    return NextResponse.json({ data: [], total: 0, error: error.message }, { status: 500 })
  }

  const counts = await jobCountMap(supabase)
  return NextResponse.json({
    data: (data ?? []).map((c) => ({ ...c, total_jobs: counts.get(c.id) || 0 })),
    total: count || 0,
    page,
    limit,
  })
}

export async function POST(request: NextRequest) {
  invalidateCached("compan")
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
  invalidateCached("compan")
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
  invalidateCached("compan")
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

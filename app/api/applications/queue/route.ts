import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const userId = searchParams.get("userId")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "10")
    const offset = (page - 1) * limit

    let query = supabase
      .from("live_application_queue")
      .select(
        `id, user_id, job_id, company_id, company_name, job_title, status, first_name, last_name, email, phone, location, started_at, completed_at, created_at`,
        { count: "exact" }
      )

    if (status) {
      query = query.eq("status", status)
    }

    if (userId) {
      query = query.eq("user_id", userId)
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const applications = (data || []).map((app: any) => ({
      id: app.id,
      userId: app.user_id,
      jobId: app.job_id,
      companyId: app.company_id,
      status: app.status,
      startedAt: app.started_at,
      completedAt: app.completed_at,
      createdAt: app.created_at,
      user: {
        name: `${app.first_name} ${app.last_name}`,
        email: app.email,
        phone: app.phone,
        location: app.location,
      },
      job: {
        title: app.job_title,
      },
      company: {
        name: app.company_name,
      },
    }))

    const total = count || 0

    return Response.json({
      success: true,
      data: applications,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const userId = searchParams.get("userId")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = parseInt(searchParams.get("offset") || "0")

    let query = supabase
      .from("applications")
      .select(
        `
        id,
        user_id,
        job_id,
        company_id,
        status,
        progress_step,
        total_steps,
        step_description,
        started_at,
        completed_at,
        error_message,
        created_at,
        users(id, name, email, phone, location),
        jobs(id, title, location, type, salary_range, company_name, portal_url),
        companies(id, name, logo_initial)
      `,
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
      return Response.json(
        { error: error.message },
        { status: 500 }
      )
    }

    const applications = data?.map((app: any) => ({
      id: app.id,
      userId: app.user_id,
      jobId: app.job_id,
      companyId: app.company_id,
      status: app.status,
      progressStep: app.progress_step || 0,
      totalSteps: app.total_steps || 5,
      stepDescription: app.step_description || "",
      errorMessage: app.error_message,
      startedAt: app.started_at,
      completedAt: app.completed_at,
      createdAt: app.created_at,
      user: app.users ? {
        id: app.users.id,
        name: app.users.name,
        email: app.users.email,
        phone: app.users.phone,
        location: app.users.location,
      } : null,
      job: app.jobs ? {
        id: app.jobs.id,
        title: app.jobs.title,
        location: app.jobs.location,
        type: app.jobs.type,
        salaryRange: app.jobs.salary_range,
        companyName: app.jobs.company_name,
        portalUrl: app.jobs.portal_url,
      } : null,
      company: app.companies ? {
        id: app.companies.id,
        name: app.companies.name,
        logoInitial: app.companies.logo_initial,
      } : null,
    }))

    return Response.json({
      success: true,
      data: applications,
      pagination: {
        total: count,
        limit,
        offset,
        hasMore: offset + limit < (count || 0),
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

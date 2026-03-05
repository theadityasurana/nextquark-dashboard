import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const applicationId = searchParams.get("applicationId")
    const userId = searchParams.get("userId")

    if (!applicationId && !userId) {
      return Response.json(
        { error: "applicationId or userId required" },
        { status: 400 }
      )
    }

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
        created_at
      `
      )

    if (applicationId) {
      query = query.eq("id", applicationId)
    } else if (userId) {
      query = query.eq("user_id", userId)
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    })

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
      progressPercentage: Math.round(
        ((app.progress_step || 0) / (app.total_steps || 5)) * 100
      ),
      startedAt: app.started_at,
      completedAt: app.completed_at,
      createdAt: app.created_at,
    }))

    return Response.json({
      success: true,
      data: applicationId ? applications?.[0] : applications,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

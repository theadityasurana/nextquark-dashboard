import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { data, error } = await supabase
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
        users(id, name, email, phone, location, headline, resume_url, cover_letter),
        jobs(id, title, location, type, salary_range, company_name, portal_url, job_url),
        companies(id, name, logo_initial, website)
      `
      )
      .eq("id", params.id)
      .single()

    if (error || !data) {
      return Response.json(
        { error: "Application not found" },
        { status: 404 }
      )
    }

    const duration = data.started_at
      ? Math.floor(
          (new Date().getTime() - new Date(data.started_at).getTime()) / 1000
        )
      : 0

    const minutes = Math.floor(duration / 60)
    const seconds = duration % 60

    return Response.json({
      success: true,
      data: {
        id: data.id,
        userId: data.user_id,
        jobId: data.job_id,
        companyId: data.company_id,
        status: data.status,
        progressStep: data.progress_step || 0,
        totalSteps: data.total_steps || 5,
        stepDescription: data.step_description || "",
        errorMessage: data.error_message,
        duration: `${minutes}m ${seconds}s`,
        startedAt: data.started_at,
        completedAt: data.completed_at,
        createdAt: data.created_at,
        progressPercentage: Math.round(
          ((data.progress_step || 0) / (data.total_steps || 5)) * 100
        ),
        user: data.users ? {
          id: data.users.id,
          name: data.users.name,
          email: data.users.email,
          phone: data.users.phone,
          location: data.users.location,
          headline: data.users.headline,
          resumeUrl: data.users.resume_url,
          coverLetter: data.users.cover_letter,
        } : null,
        job: data.jobs ? {
          id: data.jobs.id,
          title: data.jobs.title,
          location: data.jobs.location,
          type: data.jobs.type,
          salaryRange: data.jobs.salary_range,
          companyName: data.jobs.company_name,
          portalUrl: data.jobs.portal_url,
          jobUrl: data.jobs.job_url,
        } : null,
        company: data.companies ? {
          id: data.companies.id,
          name: data.companies.name,
          logoInitial: data.companies.logo_initial,
          website: data.companies.website,
        } : null,
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

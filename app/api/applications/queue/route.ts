import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status")
    const userId = searchParams.get("userId")
    const limit = parseInt(searchParams.get("limit") || "1000")
    const offset = parseInt(searchParams.get("offset") || "0")

    // Fetch all applications without limit by using pagination
    let allApplications: any[] = []
    let currentOffset = 0
    const batchSize = 1000
    
    while (true) {
      let query = supabase
        .from("live_application_queue")
        .select(
          `
          id,
          user_id,
          job_id,
          company_id,
          company_name,
          job_title,
          status,
          first_name,
          last_name,
          email,
          phone,
          location,
          started_at,
          completed_at,
          created_at
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
        .range(currentOffset, currentOffset + batchSize - 1)

      if (error) {
        return Response.json(
          { error: error.message },
          { status: 500 }
        )
      }

      if (!data || data.length === 0) break
      
      allApplications = allApplications.concat(data)
      
      if (data.length < batchSize) break
      
      currentOffset += batchSize
    }

    const applications = allApplications.map((app: any) => ({
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

    return Response.json({
      success: true,
      data: applications,
      pagination: {
        total: allApplications.length,
        limit: allApplications.length,
        offset: 0,
        hasMore: false,
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

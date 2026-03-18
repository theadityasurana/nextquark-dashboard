import { fillJobApplication } from "@/lib/automation-provider"
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { applicationId, stream } = await request.json()

    if (!applicationId) {
      return Response.json({ error: "Missing applicationId" }, { status: 400 })
    }

    const supabase = await createClient()
    
    const { data: app, error } = await supabase
      .from('live_application_queue')
      .select('*')
      .eq('id', applicationId)
      .single()

    if (error || !app) {
      return Response.json({ error: "Application not found" }, { status: 404 })
    }

    console.log(`[auto-apply-queue] App ID: ${applicationId}`)
    console.log(`[auto-apply-queue] job_url: ${app.job_url}`)
    console.log(`[auto-apply-queue] Name: ${app.first_name} ${app.last_name}`)
    console.log(`[auto-apply-queue] Email: ${app.email}`)
    console.log(`[auto-apply-queue] Resume: ${app.resume_url}`)

    await supabase
      .from('live_application_queue')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', applicationId)

    const resumeUrl = app.resume_url ? 
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/resumes/${app.user_id}/${app.resume_url}` : ""

    const experienceText = app.experience?.map((exp: any) => 
      `${exp.title} at ${exp.company} (${exp.startDate} - ${exp.isCurrent ? 'Present' : exp.endDate}) - ${exp.description}`
    ).join('\n') || ""

    const educationText = app.education?.map((edu: any) => 
      `${edu.degree} in ${edu.field || edu.course} from ${edu.institution || edu.university} (${edu.startDate} - ${edu.endDate})`
    ).join('\n') || ""

    const certificationsText = app.certifications?.map((cert: any) => 
      `${cert.name} - ${cert.issuingOrganization}`
    ).join('\n') || ""

    const achievementsText = app.achievements?.map((ach: any) => 
      `${ach.title} (${ach.date}) - ${ach.issuer}: ${ach.description}`
    ).join('\n') || ""

    const formData = {
      name: `${app.first_name} ${app.last_name}`,
      firstName: app.first_name,
      lastName: app.last_name,
      email: app.email,
      phone: app.phone,
      location: app.location,
      gender: app.gender,
      ethnicity: app.ethnicity,
      disabilityStatus: app.disability_status,
      veteranStatus: app.veteran_status,
      workAuthorization: app.work_authorization_status,
      headline: app.headline,
      bio: app.bio,
      linkedinUrl: app.linkedin_url,
      githubUrl: app.github_url,
      resume: resumeUrl,
      coverLetter: app.cover_letter,
      experience: experienceText,
      education: educationText,
      certifications: certificationsText,
      achievements: achievementsText,
      skills: app.top_skills || app.skills || [],
      jobPreferences: app.job_preferences || [],
      workModePreferences: app.work_mode_preferences || [],
      salaryCurrency: app.salary_currency,
      salaryMin: app.salary_min,
      salaryMax: app.salary_max,
    }

    if (stream) {
      return new Response(
        new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            const startTime = Date.now()
            let closed = false

            const safeEnqueue = (data: string) => {
              if (!closed) {
                try { controller.enqueue(encoder.encode(data)) } catch { closed = true }
              }
            }

            const safeClose = () => {
              if (!closed) {
                closed = true
                try { controller.close() } catch {}
              }
            }

            try {
              const onStep = (step: any) => {
                safeEnqueue(`data: ${JSON.stringify(step)}\n\n`)
              }

              const result = await fillJobApplication(
                app.job_url,
                formData,
                onStep,
                applicationId,
                app.user_id
              )

              const processingTime = Date.now() - startTime

              await supabase
                .from('live_application_queue')
                .update({
                  status: result.success ? 'completed' : 'failed',
                  completed_at: new Date().toISOString(),
                  error_message: result.error || null,
                  processing_time_ms: processingTime,
                  recording_url: result.recordingUrl || null,
                })
                .eq('id', applicationId)

              safeEnqueue(`data: ${JSON.stringify({
                status: "completed",
                success: result.success,
                result: result.result,
                steps: result.steps,
                recordingUrl: result.recordingUrl,
                taskId: result.taskId,
              })}\n\n`)

              safeClose()
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : "Unknown error"
              
              await supabase
                .from('live_application_queue')
                .update({
                  status: 'failed',
                  completed_at: new Date().toISOString(),
                  error_message: errorMsg,
                  processing_time_ms: Date.now() - startTime
                })
                .eq('id', applicationId)

              safeEnqueue(`data: ${JSON.stringify({
                status: "error",
                error: errorMsg,
              })}\n\n`)
              safeClose()
            }
          },
        }),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }
      )
    }

    const startTime = Date.now()
    const result = await fillJobApplication(
      app.job_url,
      formData,
      undefined,
      applicationId,
      app.user_id
    )

    const processingTime = Date.now() - startTime

    await supabase
      .from('live_application_queue')
      .update({
        status: result.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        error_message: result.error || null,
        processing_time_ms: processingTime,
        recording_url: result.recordingUrl || null,
      })
      .eq('id', applicationId)

    return Response.json({
      success: result.success,
      message: result.success ? "Application submitted successfully" : "Application failed",
      result: result.result,
      steps: result.steps,
      recordingUrl: result.recordingUrl,
      taskId: result.taskId,
    })
  } catch (error) {
    console.error("Auto-apply queue error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

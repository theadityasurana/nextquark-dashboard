import { fillJobApplication } from '@/lib/automation-provider'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  return Response.json({ message: 'Auto-apply endpoint is ready' })
}

export async function POST(request: Request) {
  try {
    const { userId, jobId, stream, applicationData } = await request.json()

    if (!userId || !jobId) {
      return Response.json({ error: 'Missing userId or jobId' }, { status: 400 })
    }

    if (!applicationData) {
      return Response.json({ error: 'Missing applicationData' }, { status: 400 })
    }

    let userData = applicationData
    let jobUrl   = applicationData?.job_url
    let userEmail = applicationData?.email || ''

    // Fetch email from profiles if not provided in applicationData
    if (!userEmail) {
      const supabase = createAdminClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single()
      userEmail = profile?.email || ''
    }

    if (!jobUrl) {
      return Response.json({ error: 'Missing job_url in applicationData' }, { status: 400 })
    }

    const experienceText = userData.experience?.map((exp: any) =>
      `${exp.title} at ${exp.company} (${exp.startDate} - ${exp.isCurrent ? 'Present' : exp.endDate}) - ${exp.description}`
    ).join('\n') || ''

    const educationText = userData.education?.map((edu: any) =>
      `${edu.degree} in ${edu.field || edu.course} from ${edu.institution || edu.university} (${edu.startDate} - ${edu.endDate})`
    ).join('\n') || ''

    const certificationsText = userData.certifications?.map((cert: any) =>
      `${cert.name} - ${cert.issuingOrganization}`
    ).join('\n') || ''

    const achievementsText = userData.achievements?.map((ach: any) =>
      `${ach.title} (${ach.date}) - ${ach.issuer}: ${ach.description}`
    ).join('\n') || ''

    const resumeUrl = userData.resume_url
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/resumes/${userId}/${userData.resume_url}`
      : ''

    const formData = {
      name: userData.name || `${userData.first_name} ${userData.last_name}` || '',
      firstName: userData.first_name || '',
      lastName: userData.last_name || '',
      email: userEmail || userData.email || '',
      phone: userData.phone || '',
      location: userData.location || '',
      gender: userData.gender || '',
      ethnicity: userData.ethnicity || '',
      disabilityStatus: userData.disability_status || '',
      veteranStatus: userData.veteran_status || '',
      workAuthorization: userData.work_authorization_status || '',
      headline: userData.headline || '',
      bio: userData.bio || '',
      linkedinUrl: userData.linkedin_url || '',
      githubUrl: userData.github_url || '',
      resume: resumeUrl,
      coverLetter: userData.cover_letter || '',
      experience: experienceText,
      education: educationText,
      certifications: certificationsText,
      achievements: achievementsText,
      skills: userData.top_skills || userData.skills || [],
      jobPreferences: userData.job_preferences || [],
      workModePreferences: userData.work_mode_preferences || [],
      salaryCurrency: userData.salary_currency || '',
      salaryMin: userData.salary_min || null,
      salaryMax: userData.salary_max || null,
    }

    if (stream) {
      return new Response(
        new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            let closed = false

            const safeEnqueue = (data: string) => {
              if (!closed) {
                try { controller.enqueue(encoder.encode(data)) } catch { closed = true }
              }
            }
            const safeClose = () => {
              if (!closed) { closed = true; try { controller.close() } catch {} }
            }

            try {
              const result = await fillJobApplication(jobUrl, formData, (step: any) => {
                safeEnqueue(`data: ${JSON.stringify(step)}\n\n`)
              }, userId)

              safeEnqueue(`data: ${JSON.stringify({
                status: 'completed', success: result.success,
                result: result.result, steps: result.steps,
                recordingUrl: result.recordingUrl, taskId: result.taskId,
              })}\n\n`)
              safeClose()
            } catch (error) {
              safeEnqueue(`data: ${JSON.stringify({
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
              })}\n\n`)
              safeClose()
            }
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } }
      )
    }

    const result = await fillJobApplication(jobUrl, formData, undefined, userId)

    if (result.success) {
      return Response.json({
        success: true,
        message: 'Application submitted successfully',
        user: formData.name,
        job: applicationData?.job_title || 'Unknown',
        company: applicationData?.company_name || 'Unknown',
        result: result.result,
        steps: result.steps,
        recordingUrl: result.recordingUrl,
      })
    }

    return Response.json(
      { success: false, error: result.error, user: formData.name, job: applicationData?.job_title || 'Unknown', company: applicationData?.company_name || 'Unknown' },
      { status: 500 }
    )
  } catch (error) {
    console.error('Auto-apply error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

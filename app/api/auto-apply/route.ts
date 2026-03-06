import { fillJobApplicationWithStreaming } from "@/lib/browser-use"
import { mockUsers, mockJobs } from "@/lib/mock-data"
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  return Response.json({ message: "Auto-apply endpoint is ready" })
}

export async function POST(request: Request) {
  try {
    const { userId, jobId, stream, applicationData } = await request.json()

    if (!userId || !jobId) {
      return Response.json(
        { error: "Missing userId or jobId" },
        { status: 400 }
      )
    }

    // Use provided applicationData or fallback to mock data
    let userData = applicationData
    let jobUrl = applicationData?.job_url
    let userEmail = applicationData?.email || ""

    // Fetch user email from profiles table if not in applicationData
    if (userData && !userEmail) {
      try {
        const supabase = await createClient()
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .single()
        
        userEmail = profile?.email || ""
        console.log('Fetched email from profiles:', userEmail)
      } catch (err) {
        console.error('Failed to fetch email from profiles:', err)
      }
    }

    if (!userData) {
      userData = mockUsers.find(u => u.id === userId)
      if (!userData) {
        return Response.json(
          { error: "User not found" },
          { status: 404 }
        )
      }
    }

    if (!jobUrl) {
      const jobData = mockJobs.find(j => j.id === jobId)
      if (!jobData) {
        return Response.json(
          { error: "Job not found" },
          { status: 404 }
        )
      }
      jobUrl = jobData.portalUrl
    }

    // Format experience from JSONB array
    const experienceText = userData.experience?.map((exp: any) => 
      `${exp.title} at ${exp.company} (${exp.startDate} - ${exp.isCurrent ? 'Present' : exp.endDate}) - ${exp.description}`
    ).join('\n') || ""

    // Format education from JSONB array
    const educationText = userData.education?.map((edu: any) => 
      `${edu.degree} in ${edu.field || edu.course} from ${edu.institution || edu.university} (${edu.startDate} - ${edu.endDate})`
    ).join('\n') || ""

    // Format certifications
    const certificationsText = userData.certifications?.map((cert: any) => 
      `${cert.name} - ${cert.issuingOrganization}`
    ).join('\n') || ""

    // Format achievements
    const achievementsText = userData.achievements?.map((ach: any) => 
      `${ach.title} (${ach.date}) - ${ach.issuer}: ${ach.description}`
    ).join('\n') || ""

    // Get resume URL from Supabase storage
    const resumeUrl = userData.resume_url ? 
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/resumes/${userData.resume_url}` : ""

    const formData = {
      // Basic Info
      name: userData.name || `${userData.first_name} ${userData.last_name}` || "",
      firstName: userData.first_name || "",
      lastName: userData.last_name || "",
      email: userEmail || userData.email || "",
      phone: userData.phone || "",
      location: userData.location || "",
      
      // Demographics
      gender: userData.gender || "",
      ethnicity: userData.ethnicity || "",
      disabilityStatus: userData.disability_status || "",
      veteranStatus: userData.veteran_status || "",
      workAuthorization: userData.work_authorization_status || "",
      
      // Professional Info
      headline: userData.headline || "",
      bio: userData.bio || "",
      
      // URLs
      linkedinUrl: userData.linkedin_url || "",
      githubUrl: userData.github_url || "",
      
      // Documents
      resume: resumeUrl,
      coverLetter: userData.cover_letter || "",
      
      // Detailed Info
      experience: experienceText,
      education: educationText,
      certifications: certificationsText,
      achievements: achievementsText,
      
      // Skills
      skills: userData.top_skills || userData.skills || [],
      
      // Preferences
      jobPreferences: userData.job_preferences || [],
      workModePreferences: userData.work_mode_preferences || [],
      
      // Salary
      salaryCurrency: userData.salary_currency || "",
      salaryMin: userData.salary_min || null,
      salaryMax: userData.salary_max || null,
    }

    console.log('FormData being sent to browser-use:', JSON.stringify(formData, null, 2))
    console.log('Resume URL:', resumeUrl)
    console.log('User Email:', userEmail)

    if (stream) {
      return new Response(
        new ReadableStream({
          async start(controller) {
            try {
              const encoder = new TextEncoder()

              const onStep = (step: any) => {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(step)}\n\n`)
                )
              }

              const result = await fillJobApplicationWithStreaming(
                jobUrl,
                formData,
                onStep
              )

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    status: "completed",
                    success: result.success,
                    result: result.result,
                    steps: result.steps,
                  })}\n\n`
                )
              )

              controller.close()
            } catch (error) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    status: "error",
                    error: error instanceof Error ? error.message : "Unknown error",
                  })}\n\n`
                )
              )
              controller.close()
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

    const result = await fillJobApplicationWithStreaming(
      jobUrl,
      formData
    )

    if (result.success) {
      return Response.json({
        success: true,
        message: "Application submitted successfully",
        user: formData.name,
        job: applicationData?.job_title || "Unknown",
        company: applicationData?.company_name || "Unknown",
        result: result.result,
        steps: result.steps,
      })
    } else {
      return Response.json(
        {
          success: false,
          error: result.error,
          user: formData.name,
          job: applicationData?.job_title || "Unknown",
          company: applicationData?.company_name || "Unknown",
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Auto-apply error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

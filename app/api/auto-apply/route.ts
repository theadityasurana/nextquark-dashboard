import { fillJobApplicationWithStreaming } from "@/lib/browser-use"
import { mockUsers, mockJobs } from "@/lib/mock-data"

export async function GET() {
  return Response.json({ message: "Auto-apply endpoint is ready" })
}

export async function POST(request: Request) {
  try {
    const { userId, jobId, stream } = await request.json()

    if (!userId || !jobId) {
      return Response.json(
        { error: "Missing userId or jobId" },
        { status: 400 }
      )
    }

    const userData = mockUsers.find(u => u.id === userId)
    if (!userData) {
      return Response.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    const jobData = mockJobs.find(j => j.id === jobId)
    if (!jobData) {
      return Response.json(
        { error: "Job not found" },
        { status: 404 }
      )
    }

    const applicationData = {
      name: userData.name || "",
      email: userData.email || "",
      phone: userData.phone || "",
      location: userData.location || "",
      resume: userData.resumeUrl || "",
      coverLetter: userData.coverLetter || "",
      experience: userData.experience || "",
      education: userData.education?.map(e => `${e.degree} in ${e.course} from ${e.university}`).join("; ") || "",
      skills: userData.skills || [],
    }

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
                jobData.portalUrl,
                applicationData,
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
      jobData.portalUrl,
      applicationData
    )

    if (result.success) {
      return Response.json({
        success: true,
        message: "Application submitted successfully",
        user: userData.name,
        job: jobData.title,
        company: jobData.companyName,
        result: result.result,
        steps: result.steps,
      })
    } else {
      return Response.json(
        {
          success: false,
          error: result.error,
          user: userData.name,
          job: jobData.title,
          company: jobData.companyName,
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

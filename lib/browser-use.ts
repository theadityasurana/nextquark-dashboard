import { BrowserUse } from "browser-use-sdk"
import { createClient } from "@supabase/supabase-js"
import axios from "axios"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

let cachedApiKey: string | null = null

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("browserUseApiKey")
      .single()

    if (error) throw error
    cachedApiKey = data?.browserUseApiKey || process.env.BROWSER_USE_API_KEY
    return cachedApiKey || ""
  } catch (error) {
    console.error("Failed to fetch API key from settings:", error)
    return process.env.BROWSER_USE_API_KEY || ""
  }
}

async function downloadResumeAsBase64(resumeUrl: string): Promise<string | null> {
  if (!resumeUrl) return null
  try {
    const response = await axios.get(resumeUrl, { responseType: "arraybuffer" })
    return Buffer.from(response.data).toString("base64")
  } catch (error) {
    console.error("Failed to download resume:", error)
    return null
  }
}

export interface BrowserUseResponse {
  success: boolean
  result?: string
  error?: string
  steps?: number
}

export interface StreamCallback {
  (step: any): void
}

export async function fillJobApplicationWithStreaming(
  portalUrl: string,
  userData: {
    name: string
    email: string
    phone: string
    location: string
    resume: string
    coverLetter: string
    experience: string
    education: string
    skills: string[]
  },
  onStep?: StreamCallback
): Promise<BrowserUseResponse> {
  const apiKey = await getApiKey()
  
  if (!apiKey) {
    return {
      success: false,
      error: "BROWSER_USE_API_KEY is not configured. Please set it in settings.",
    }
  }

  try {
    const resumeBase64 = await downloadResumeAsBase64(userData.resume)
    
    const client = new BrowserUse({
      apiKey,
    })

    const goal = `Navigate to ${portalUrl} and fill out the job application form and click the submit button.
      
Available user data:
- Name: ${userData.name}
- Email: ${userData.email}
- Phone: ${userData.phone}
- Location: ${userData.location}
- Resume (PDF base64): ${resumeBase64 ? "[PDF file available - upload to form]" : "[No resume available]"}
- Cover Letter: ${userData.coverLetter}
- Experience: ${userData.experience}
- Education: ${userData.education}
- Skills: ${userData.skills.join(", ")}

CRITICAL INSTRUCTIONS:
1. Only fill fields that are actually present in the form
2. If a field is not available, skip it completely
3. Always upload the resume PDF to file input fields if available
4. Adapt to the form's requirements - use only the data that matches the form fields
5. After filling all available fields, submit the application

Example: If the form only asks for name and resume, fill only those two fields.`

    console.log("Starting Browser Use task with streaming for:", userData.name)

    let stepCount = 0
    let result: any = null

    for await (const step of client.run(goal)) {
      stepCount++
      if (onStep) {
        let screenshot = null
        if (step.screenshot) {
          screenshot = typeof step.screenshot === 'string' 
            ? (step.screenshot.startsWith('data:') ? step.screenshot : `data:image/png;base64,${step.screenshot}`)
            : null
        }
        
        const log = step.action?.type || step.nextGoal || step.memory || "Processing..."
        
        onStep({
          step: stepCount,
          status: "in_progress",
          data: step,
          screenshot,
          log,
        })
      }
      result = step
    }

    return {
      success: true,
      result: String(result),
      steps: stepCount,
    }
  } catch (error) {
    console.error("Browser Use streaming error:", error)
    if (onStep) {
      onStep({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

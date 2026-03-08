import { BrowserUse } from "browser-use-sdk"
import { createClient } from "@supabase/supabase-js"
import axios from "axios"
import { buildOptimizedPrompt, detectPortal } from "./portal-detector"

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

async function uploadResumeToSession(
  client: BrowserUse,
  sessionId: string,
  resumeUrl: string
): Promise<boolean> {
  if (!resumeUrl) {
    console.log('❌ No resume URL provided')
    return false
  }
  
  console.log('📄 Attempting to upload resume from:', resumeUrl)
  
  try {
    const response = await axios.get(resumeUrl, { responseType: "arraybuffer" })
    const resumeBuffer = response.data
    
    console.log('✅ Resume downloaded, size:', resumeBuffer.byteLength, 'bytes')
    
    const upload = await client.files.sessionUrl(sessionId, {
      fileName: "resume.pdf",
      contentType: "application/pdf",
      sizeBytes: resumeBuffer.byteLength,
    })
    
    console.log('📤 Uploading to BrowserUse presigned URL...')
    
    await fetch(upload.presignedUrl, {
      method: "PUT",
      body: resumeBuffer,
      headers: { "Content-Type": "application/pdf" },
    })
    
    console.log('✅ Resume uploaded successfully to session')
    return true
  } catch (error) {
    console.error('❌ Failed to upload resume:', error)
    return false
  }
}

export interface BrowserUseResponse {
  success: boolean
  result?: string
  error?: string
  steps?: number
  liveUrl?: string | null
  recordingUrl?: string | null
  sessionId?: string
}

export interface StreamCallback {
  (step: any): void
}

export async function fillJobApplicationWithStreaming(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<BrowserUseResponse> {
  const apiKey = await getApiKey()
  const startTime = Date.now()
  
  if (!apiKey) {
    return {
      success: false,
      error: "BROWSER_USE_API_KEY is not configured. Please set it in settings.",
    }
  }

  try {
    const portal = detectPortal(portalUrl)
    const portalType = portal?.name || 'Unknown'
    
    const captchaSolverKey = process.env.CAPTCHA_SOLVER_API_KEY
    
    const client = new BrowserUse({
      apiKey,
      ...(captchaSolverKey && {
        captchaSolver: {
          enabled: true,
          provider: "2captcha",
          apiKey: captchaSolverKey,
        },
      }),
    })

    console.log(`Starting Browser Use task for: ${userData.name}${portal ? ` [${portal.name} detected]` : " [Unknown portal]"}`)

    // Create session first to get liveUrl
    const session = await client.sessions.create()
    const liveUrl = session.liveUrl
    console.log('Live streaming URL:', liveUrl)
    
    // Upload resume to session
    const resumeUploaded = await uploadResumeToSession(client, session.id, userData.resume)
    
    const goal = buildOptimizedPrompt(portalUrl, userData, resumeUploaded ? "uploaded" : null)
    
    // Send liveUrl immediately via callback
    if (onStep && liveUrl) {
      onStep({
        status: "session_created",
        liveUrl,
        log: resumeUploaded ? "Browser session created, resume uploaded" : "Browser session created",
      })
    }

    let stepCount = 0
    let result: any = null
    let errorMessage: string | null = null

    // Run task in the created session
    for await (const step of client.run(goal, { sessionId: session.id })) {
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
          liveUrl,
        })
      }
      result = step
    }

    // Fetch recording URL after session completes
    let recordingUrl: string | null = null
    try {
      const sessionDetails = await client.sessions.get(session.id)
      recordingUrl = sessionDetails.recordingUrl || null
      console.log('Recording URL:', recordingUrl)
    } catch (error) {
      console.error('Failed to fetch recording URL:', error)
    }

    const processingTime = Date.now() - startTime
    const success = true

    // Log portal metrics
    if (applicationId) {
      await supabase.from('portal_metrics').insert({
        portal_type: portalType,
        application_id: applicationId,
        response_time_ms: processingTime,
        status: success ? 'success' : 'failure',
        error_message: errorMessage
      }).catch(err => console.error('Failed to log portal metrics:', err))
    }

    return {
      success,
      result: String(result),
      steps: stepCount,
      liveUrl,
      recordingUrl,
      sessionId: session.id,
    }
  } catch (error) {
    const processingTime = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    
    console.error("Browser Use streaming error:", error)
    
    // Log failed portal metrics
    if (applicationId) {
      const portal = detectPortal(portalUrl)
      await supabase.from('portal_metrics').insert({
        portal_type: portal?.name || 'Unknown',
        application_id: applicationId,
        response_time_ms: processingTime,
        status: 'failure',
        error_message: errorMsg
      }).catch(err => console.error('Failed to log portal metrics:', err))
    }
    
    if (onStep) {
      onStep({
        status: "error",
        error: errorMsg,
      })
    }
    return {
      success: false,
      error: errorMsg,
    }
  }
}

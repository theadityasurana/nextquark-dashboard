import { createClient } from "@supabase/supabase-js"
import axios from "axios"
import { detectPortal } from "./portal-detector"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const SKYVERN_BASE_URL = process.env.SKYVERN_BASE_URL || "https://api.skyvern.com"

let cachedApiKey: string | null = null

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("skyvernApiKey")
      .single()

    if (error) throw error
    cachedApiKey = data?.skyvernApiKey || process.env.SKYVERN_API_KEY
    return cachedApiKey || ""
  } catch (error) {
    console.error("Failed to fetch API key from settings:", error)
    return process.env.SKYVERN_API_KEY || ""
  }
}

export function clearCachedApiKey() {
  cachedApiKey = null
}

export interface SkyvernResponse {
  success: boolean
  result?: string
  error?: string
  steps?: number
  recordingUrl?: string | null
  taskId?: string
}

export interface StreamCallback {
  (step: any): void
}

interface SkyvernRunResponse {
  run_id: string
  status: string
  output?: any
  downloaded_files?: any[]
  recording_url?: string | null
  screenshot_urls?: string[] | null
  failure_reason?: string | null
  created_at: string
  modified_at: string
  queued_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  step_count?: number | null
}

const TERMINAL_STATUSES = ["completed", "failed", "terminated", "canceled", "timed_out"]

async function skyvernRequest(
  method: "GET" | "POST",
  path: string,
  body?: any
): Promise<any> {
  const apiKey = await getApiKey()
  if (!apiKey) throw new Error("SKYVERN_API_KEY is not configured. Please set it in settings.")

  const url = `${SKYVERN_BASE_URL}${path}`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  }

  const res = await axios({ method, url, headers, data: body, timeout: 300000 })
  return res.data
}

async function persistLog(applicationId: string, level: string, message: string) {
  try {
    await supabase.from("application_logs").insert({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level,
      agent_id: applicationId,
      message,
      application_id: applicationId,
    })
  } catch (err) {
    console.error("Failed to persist log:", err)
  }
}

async function pollTaskUntilComplete(
  runId: string,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<SkyvernRunResponse> {
  const maxPolls = 120
  const pollInterval = 5000
  let stepCount = 0

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollInterval))

    const run: SkyvernRunResponse = await skyvernRequest("GET", `/v1/runs/${runId}`)
    stepCount++

    const isTerminal = TERMINAL_STATUSES.includes(run.status)
    const stepStatus = run.status === "completed" ? "completed"
      : isTerminal ? "error"
      : "in_progress"

    const stepsInfo = run.step_count ? ` (${run.step_count} steps used)` : ""
    const logMessage = `[Poll ${stepCount}] Status: ${run.status}${stepsInfo}`

    if (applicationId) {
      await persistLog(applicationId, stepStatus === "error" ? "error" : "info", logMessage)
    }

    if (onStep) {
      onStep({
        step: stepCount,
        status: stepStatus,
        log: logMessage,
        taskId: runId,
        screenshotUrl: run.screenshot_urls?.[0] || null,
      })
    }

    if (isTerminal) return run
  }

  throw new Error("Task polling timed out after 10 minutes")
}

function buildUserDataJson(userData: any): Record<string, any> {
  const json: Record<string, any> = {}

  if (userData.firstName) json.first_name = userData.firstName
  if (userData.lastName) json.last_name = userData.lastName
  if (userData.name) json.name = userData.name
  if (userData.email) json.email = userData.email
  if (userData.phone) json.phone = userData.phone
  if (userData.location) json.location = userData.location
  if (userData.linkedinUrl) json.linkedin_url = userData.linkedinUrl
  if (userData.githubUrl) json.github_url = userData.githubUrl
  if (userData.gender) json.gender = userData.gender
  if (userData.ethnicity) json.ethnicity = userData.ethnicity
  if (userData.disabilityStatus) json.disability_status = userData.disabilityStatus
  if (userData.veteranStatus) json.veteran_status = userData.veteranStatus
  if (userData.workAuthorization) json.work_authorization = userData.workAuthorization
  if (userData.resume) json.resume_url = userData.resume
  if (userData.coverLetter) json.cover_letter = userData.coverLetter
  if (userData.experience) json.experience = userData.experience
  if (userData.education) json.education = userData.education
  if (userData.certifications) json.certifications = userData.certifications
  if (userData.achievements) json.achievements = userData.achievements
  if (userData.skills?.length > 0) json.skills = userData.skills
  if (userData.salaryMin || userData.salaryMax) {
    json.salary_expectation = `${userData.salaryCurrency || "USD"} ${userData.salaryMin || 0} - ${userData.salaryMax || 0}`
  }

  return json
}

function buildPrompt(userData: any): string {
  const userJson = buildUserDataJson(userData)

  return `Fill out the job application form and apply to the job. Fill out any public burden questions if they appear in the form. Your goal is complete when the page says you've successfully applied to the job. Terminate if you are unable to apply successfully.

${JSON.stringify(userJson, null, 2)}`
}

export async function fillJobApplicationWithStreaming(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<SkyvernResponse> {
  const apiKey = await getApiKey()
  const startTime = Date.now()

  if (!apiKey) {
    return {
      success: false,
      error: "SKYVERN_API_KEY is not configured. Please set it in settings.",
    }
  }

  try {
    const portal = detectPortal(portalUrl)
    const portalType = portal?.name || "Unknown"
    const engine = portal?.engine || "skyvern-2.0"
    const targetUrl = portal?.getApplyUrl(portalUrl) || portalUrl
    const maxSteps = engine === "skyvern-1.0" ? 30 : 50

    console.log(`Starting Skyvern task for: ${userData.name} | Portal: ${portalType} | Engine: ${engine} | URL: ${targetUrl}`)

    if (applicationId) {
      await persistLog(applicationId, "info", `Starting application for ${userData.name} | ${portalType} portal | Engine: ${engine}`)
    }

    if (onStep) {
      onStep({
        status: "session_created",
        log: `Submitting to Skyvern (${engine})...`,
      })
    }

    const prompt = buildPrompt(userData)

    const taskPayload = {
      prompt,
      url: targetUrl,
      engine,
      proxy_location: "RESIDENTIAL" as const,
      max_steps: maxSteps,
      data_extraction_schema: null,
    }

    const createResponse: SkyvernRunResponse = await skyvernRequest("POST", "/v1/run/tasks", taskPayload)
    const runId = createResponse.run_id

    console.log("Skyvern task created:", runId)

    if (applicationId) {
      await persistLog(applicationId, "info", `Task ${runId} created. Polling...`)
    }

    if (onStep) {
      onStep({
        step: 0,
        status: "in_progress",
        log: `Task ${runId} created. Polling for updates...`,
        taskId: runId,
      })
    }

    const finalRun = await pollTaskUntilComplete(runId, onStep, applicationId)

    const processingTime = Date.now() - startTime
    const success = finalRun.status === "completed"
    const errorMessage = finalRun.failure_reason || null
    const recordingUrl = finalRun.recording_url || null

    console.log("Skyvern task done:", { runId, success, steps: finalRun.step_count, recordingUrl })

    if (applicationId) {
      const resultMsg = success
        ? `Completed in ${Math.round(processingTime / 1000)}s, ${finalRun.step_count || 0} steps${recordingUrl ? ` | Recording: ${recordingUrl}` : ""}`
        : `Failed: ${errorMessage || "Unknown error"}`
      await persistLog(applicationId, success ? "info" : "error", resultMsg)

      try {
        await supabase.from("portal_metrics").insert({
          portal_type: portalType,
          application_id: applicationId,
          response_time_ms: processingTime,
          status: success ? "success" : "failure",
          error_message: errorMessage,
        })
      } catch (err) {
        console.error("Failed to log portal metrics:", err)
      }
    }

    return {
      success,
      result: success
        ? JSON.stringify(finalRun.output || "Application submitted")
        : errorMessage || "Task failed",
      steps: finalRun.step_count || 0,
      recordingUrl,
      taskId: runId,
    }
  } catch (error) {
    const processingTime = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : "Unknown error"

    console.error("Skyvern task error:", error)

    if (applicationId) {
      await persistLog(applicationId, "error", `Task error: ${errorMsg}`)

      const portal = detectPortal(portalUrl)
      try {
        await supabase.from("portal_metrics").insert({
          portal_type: portal?.name || "Unknown",
          application_id: applicationId,
          response_time_ms: processingTime,
          status: "failure",
          error_message: errorMsg,
        })
      } catch (err) {
        console.error("Failed to log portal metrics:", err)
      }
    }

    if (onStep) {
      onStep({ status: "error", error: errorMsg })
    }

    return { success: false, error: errorMsg }
  }
}

export async function scrapeJobsWithSkyvern(portalUrl: string): Promise<any[]> {
  const apiKey = await getApiKey()
  if (!apiKey) return []

  try {
    console.log("Starting Skyvern scrape for:", portalUrl)

    const taskPayload = {
      prompt: `Navigate to the careers/jobs page and find all job listings. Extract all job listings. For each job extract: title, location, type, experience, salaryMin, salaryMax, description, jobUrl, requirements (array), skills (array), benefits (array). Return a JSON array.`,
      url: portalUrl,
      engine: "skyvern-2.0" as const,
      proxy_location: "RESIDENTIAL" as const,
      max_steps: 30,
      data_extraction_schema: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            location: { type: "string" },
            type: { type: "string" },
            jobUrl: { type: "string" },
            description: { type: "string" },
          },
        },
      },
    }

    const createResponse: SkyvernRunResponse = await skyvernRequest("POST", "/v1/run/tasks", taskPayload)
    const runId = createResponse.run_id

    console.log("Skyvern scrape task created:", runId)

    const finalRun = await pollTaskUntilComplete(runId)

    if (finalRun.status === "completed" && finalRun.output) {
      const extracted = finalRun.output
      if (Array.isArray(extracted)) return extracted
      if (typeof extracted === "string") {
        try {
          const parsed = JSON.parse(extracted)
          if (Array.isArray(parsed)) return parsed
        } catch (_e) {}
      }
      if (typeof extracted === "object" && extracted.jobs) return extracted.jobs
    }

    console.error("Could not extract jobs from Skyvern response")
    return []
  } catch (error) {
    console.error("Skyvern scraper error:", error)
    return []
  }
}

import { createClient } from "@supabase/supabase-js"
import axios from "axios"
import { detectPortal } from "./portal-detector"
import { canDirectApply, directApply, type DirectApplyPortal, type DirectApplyResponse } from "./direct-apply"

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

const OTP_DETECTION_KEYWORDS = [
  "otp_verification_required", "otp", "verification code", "verify your email",
  "enter the code", "confirmation code", "one-time", "one time password",
  "2fa", "two-factor", "check your email", "sent a code", "enter code", "verify code",
]

// ─── Browser Session helpers ───

async function createBrowserSession(timeoutMinutes: number = 30): Promise<string> {
  const res = await skyvernRequest("POST", "/v1/browser_sessions", { timeout: timeoutMinutes })
  return res.browser_session_id
}

async function closeBrowserSession(sessionId: string): Promise<void> {
  try {
    await skyvernRequest("POST", `/v1/browser_sessions/${sessionId}/close`, {})
  } catch (err) {
    console.error("Failed to close browser session:", err)
  }
}

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

function detectOtpRequired(run: SkyvernRunResponse): boolean {
  const textToCheck = [
    run.failure_reason || "",
    typeof run.output === "string" ? run.output : JSON.stringify(run.output || ""),
  ].join(" ").toLowerCase()

  return OTP_DETECTION_KEYWORDS.some(kw => textToCheck.includes(kw))
}

// Poll the DB for the OTP to be filled in by the email pipeline or manual entry
async function waitForOtp(
  applicationId: string,
  onStep?: StreamCallback,
  timeoutMs: number = 10 * 60 * 1000 // 10 minutes
): Promise<string | null> {
  const pollInterval = 5000
  const maxPolls = Math.ceil(timeoutMs / pollInterval)

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollInterval))

    const { data } = await supabase
      .from("live_application_queue")
      .select("verification_otp")
      .eq("id", applicationId)
      .single()

    if (data?.verification_otp) {
      if (onStep) {
        onStep({ status: "in_progress", log: `OTP received: ${data.verification_otp}. Resuming automation...` })
      }
      await persistLog(applicationId, "info", `OTP received. Resuming automation...`)
      return data.verification_otp
    }

    if (onStep && i % 6 === 0) { // log every 30s
      onStep({ status: "awaiting_otp", log: `Waiting for OTP... (${Math.round((i * pollInterval) / 1000)}s elapsed)` })
    }
  }

  await persistLog(applicationId, "error", "OTP wait timed out after 10 minutes")
  return null
}

// Run a task inside a browser session and poll until complete
async function runTaskInSession(
  sessionId: string,
  prompt: string,
  url: string,
  engine: string,
  maxSteps: number,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<SkyvernRunResponse> {
  const taskPayload = {
    prompt,
    url,
    engine,
    browser_session_id: sessionId,
    proxy_location: "RESIDENTIAL" as const,
    max_steps: maxSteps,
    data_extraction_schema: null,
  }

  const createResponse: SkyvernRunResponse = await skyvernRequest("POST", "/v1/run/tasks", taskPayload)
  const runId = createResponse.run_id

  if (applicationId) {
    await persistLog(applicationId, "info", `Task ${runId} created in session ${sessionId}. Polling...`)
  }
  if (onStep) {
    onStep({ step: 0, status: "in_progress", log: `Task ${runId} created. Polling...`, taskId: runId })
  }

  return pollTaskUntilComplete(runId, onStep, applicationId)
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

// ─── Per-Portal max_steps ───

const PORTAL_MAX_STEPS: Record<string, number> = {
  Lever: 10,
  Greenhouse: 15,
  Ashby: 12,
  SmartRecruiters: 15,
  BambooHR: 12,
  Jobvite: 12,
  Workday: 25,
  iCIMS: 20,
  LinkedIn: 25,
}

function getMaxSteps(portalName: string, engine: string): number {
  return PORTAL_MAX_STEPS[portalName] || (engine === "skyvern-1.0" ? 18 : 30)
}

// ─── ATS-Specific Prompt Templates ───

function buildPortalPrompt(portalName: string, userData: any): string {
  const userJson = buildUserDataJson(userData)
  const dataBlock = JSON.stringify(userJson, null, 2)

  const commonRules = `
IMPORTANT RULES:
- ONLY fill fields that are MANDATORY / REQUIRED (marked with *, "required", or that block form submission). SKIP all optional fields entirely.
- Do NOT fill optional fields like "How did you hear about us", cover letter, LinkedIn URL, GitHub URL, portfolio, website, or any field not marked as required.
- For required dropdown/select fields, pick the CLOSEST matching option. If no exact match, pick the most reasonable one.
- For required acknowledgement/agreement/certification checkboxes, CHECK THEM (select "I agree" / "I acknowledge" / "I confirm").
- For work authorization: answer ONLY if the field is required.
- Upload the resume from the provided resume_url ONLY if the resume field is required.
- Do NOT click "Save for later" or "Save draft". Only click "Submit" / "Apply" / "Send Application".
- If a popup, modal, or cookie banner appears, DISMISS it immediately and continue.
- TERMINATE IMMEDIATELY if you see a "successfully applied" or "application received" confirmation.
- TERMINATE if you encounter a login wall that cannot be bypassed.
- SKIP EEO/demographic questions (gender, race, veteran status, disability) unless they are explicitly required and block submission.
- IMPORTANT: If after submitting the form you see an OTP/verification code page (e.g. "Enter the code sent to your email", "Verify your email", "Enter verification code"), STOP IMMEDIATELY. Do NOT try to guess or enter any code. TERMINATE the task and include the phrase "OTP_VERIFICATION_REQUIRED" in your final output/reason.`

  switch (portalName) {
    case "Greenhouse":
      return `You are on a Greenhouse job application page. This is a SINGLE-PAGE form.

STEPS:
1. Scroll down to the "Apply for this job" section.
2. Fill in ONLY the required fields: First Name, Last Name, Email, Phone — these are always required.
3. Upload resume ONLY if the resume field is marked as required.
4. Answer ONLY custom questions that are marked as required (have * or "required" label). SKIP all optional questions.
5. SKIP: LinkedIn URL, Website, Cover Letter, "How did you hear" — unless explicitly marked required.
6. SKIP: EEO/demographic section (gender, race, veteran, disability) — these are always optional on Greenhouse.
7. Scroll to the bottom and click "Submit Application".
8. Wait for confirmation. DONE.

KNOWN QUIRKS:
- Greenhouse forms are single-page. Do NOT look for a "Next" button.
- Some fields use a location autocomplete — type the city and select from the dropdown suggestions.
- If submission fails due to a missing required field, fill ONLY that field and resubmit.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    case "Lever":
      return `You are on a Lever job application page. Navigate to the /apply page if not already there.

STEPS:
1. If you see the job description page, click the "Apply for this job" button.
2. Fill in ONLY required fields: Full Name, Email, Phone.
3. Upload resume ONLY if marked as required.
4. SKIP: LinkedIn URL, GitHub URL, Cover Letter, Additional Information — unless marked required.
5. Answer ONLY custom questions that are marked as required. SKIP all optional ones.
6. Check ONLY required checkboxes.
7. SKIP: EEO section (gender, race, veteran status) — these are always optional on Lever.
8. Click "Submit Application".
9. Wait for confirmation. DONE.

KNOWN QUIRKS:
- Lever uses a SINGLE full name field, not separate first/last name. Combine them.
- The resume upload may be a drag-and-drop area — click it to open the file picker.
- Some Lever forms have an hCaptcha — wait for it to auto-solve or complete it.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    case "Ashby":
      return `You are on an Ashby job application page.

STEPS:
1. Scroll down to find the application form.
2. Fill in ONLY required fields: Name (or First Name + Last Name), Email, Phone Number.
3. Upload resume ONLY if marked as required.
4. SKIP: LinkedIn URL, Location — unless marked required.
5. Answer ONLY custom questions that are marked as required. SKIP all optional ones.
6. Check ONLY required checkboxes (arbitration agreements that block submission).
7. Click "Submit".
8. If a separate EEO/demographic survey appears AFTER submission, SKIP it (click "Skip" or close it). Do NOT fill it out.
9. Wait for confirmation. DONE.

KNOWN QUIRKS:
- Ashby location fields require selecting from an autocomplete dropdown — type the city and select a suggestion.
- Boolean fields show as Yes/No toggle buttons, not checkboxes.
- If submission fails due to a missing required field, fill ONLY that field and resubmit.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    case "Workday":
      return `You are on a Workday job application page. This is a MULTI-PAGE form with several steps.

STEPS:
1. Click "Apply" or "Apply Manually". Do NOT click "Apply with LinkedIn".
2. If there's a "Sign In" page, look for "Create Account" or "Apply without account". If forced to sign in, use the applicant's email.
3. The form has MULTIPLE PAGES. On each page, fill ONLY the required/mandatory fields (marked with * or "required"), then click "Next" / "Continue".
4. SKIP all optional fields on every page. Do NOT fill optional experience, education, or additional info unless required.
5. Upload resume ONLY if the field is required. If "My Experience" offers resume auto-fill, USE IT to save steps.
6. On the Review page, click "Submit" immediately.
7. Wait for confirmation. DONE.

KNOWN QUIRKS:
- Workday forms are MULTI-PAGE. Always click "Next"/"Continue" after filling required fields.
- "Source" / "How did you hear" is often required on Workday — if so, select "Job Board" or "Internet".
- If submission fails due to a missing required field, fill ONLY that field and resubmit.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    case "iCIMS":
      return `You are on an iCIMS job application page. This may be a multi-step form.

STEPS:
1. Click "Apply" or "Apply Now".
2. Look for "Apply as Guest" or "Continue without signing in" if available.
3. Fill in ONLY required fields: First Name, Last Name, Email, Phone. Fill address ONLY if required.
4. Upload resume ONLY if required.
5. SKIP optional work experience and education pages — click "Next" / "Skip" if possible.
6. Answer ONLY required screening questions. SKIP optional ones.
7. SKIP EEO/demographic questions — these are always optional.
8. Click "Submit Application".
9. Wait for confirmation. DONE.

KNOWN QUIRKS:
- iCIMS often requires account creation — look for guest/quick apply options first.
- Phone fields often require selecting a phone type — select "Mobile".
- If submission fails due to a missing required field, fill ONLY that field and resubmit.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    default:
      return `Fill out the job application form and submit it. This is an unknown portal type, so follow these general steps:

STEPS:
1. If on a job description page, find and click the "Apply" button.
2. Fill in ONLY mandatory/required fields (marked with *, "required", or that block submission). SKIP all optional fields.
3. Upload resume ONLY if the field is required.
4. For required dropdown fields, select the closest matching option.
5. Answer ONLY required custom questions. SKIP optional ones.
6. Check ONLY required checkboxes and agreements.
7. If the form has multiple pages, fill only required fields on each page, then click "Next"/"Continue".
8. Click "Submit" / "Apply" / "Send Application" on the final page.
9. Wait for a confirmation message. DONE.
${commonRules}

APPLICANT DATA:
${dataBlock}`
  }
}

export async function fillJobApplicationWithStreaming(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<SkyvernResponse> {
  const startTime = Date.now()
  const portal = detectPortal(portalUrl)
  const portalType = portal?.name || "Unknown"

  // ─── Try Direct API first for supported portals ───
  let directFailContext: DirectApplyResponse | null = null

  if (portal?.supportsDirectApi && canDirectApply(portalType)) {
    console.log(`Attempting Direct API for: ${userData.name} | Portal: ${portalType} | URL: ${portalUrl}`)

    const directResult = await directApply(
      portalType as DirectApplyPortal,
      portalUrl,
      userData,
      onStep,
      applicationId
    )

    if (directResult.success) {
      return directResult
    }

    // Direct API failed — save context for smarter Skyvern fallback
    directFailContext = directResult
    console.log(`Direct API failed for ${portalType}, falling back to Skyvern...`)
    if (applicationId) {
      await persistLog(applicationId, "info", `Direct API failed, falling back to Skyvern browser automation...`)
    }
  }

  // ─── Skyvern fallback ───
  const apiKey = await getApiKey()

  if (!apiKey) {
    return {
      success: false,
      error: "SKYVERN_API_KEY is not configured. Please set it in settings.",
    }
  }

  try {
    const engine = portal?.engine || "skyvern-2.0"
    const targetUrl = portal?.getApplyUrl(portalUrl) || portalUrl

    let maxSteps = getMaxSteps(portalType, engine)

    console.log(`Starting Skyvern task for: ${userData.name} | Portal: ${portalType} | Engine: ${engine} | URL: ${targetUrl}`)

    if (applicationId) {
      await persistLog(applicationId, "info", `Starting Skyvern application for ${userData.name} | ${portalType} portal | Engine: ${engine}`)
    }

    if (onStep) {
      onStep({
        status: "session_created",
        log: `Submitting to Skyvern (${engine})...`,
      })
    }

    const prompt = buildPortalPrompt(portalType, userData)
    maxSteps = directFailContext?.unmappedFields && directFailContext.unmappedFields.length <= 5
      ? Math.min(maxSteps, 20)
      : getMaxSteps(portalType, engine)

    // ─── Create a persistent browser session ───
    // The session keeps the browser alive between tasks so OTP page state is preserved
    const browserSessionId = await createBrowserSession(30)
    console.log("Browser session created:", browserSessionId)

    if (applicationId) {
      await persistLog(applicationId, "info", `Browser session ${browserSessionId} created.`)
    }

    try {
    let finalRun = await runTaskInSession(
      browserSessionId, prompt, targetUrl, engine, maxSteps, onStep, applicationId
    )
    let totalSteps = finalRun.step_count || 0
    let lastRecordingUrl = finalRun.recording_url || null
    let lastTaskId = finalRun.run_id || browserSessionId

    // ─── OTP Pause & Resume (same browser session) ───
    // Task 1 ended on the OTP page. The browser is still open on that page.
    // We pause, wait for OTP from DB, then run Task 2 in the SAME session.
    // Note: Skyvern may report status as "completed" because it successfully followed
    // the instruction to terminate on OTP — so we check OTP keywords regardless of status.
    if (applicationId && detectOtpRequired(finalRun)) {
      console.log("OTP detected. Browser session still open on OTP page. Pausing...")

      await supabase
        .from("live_application_queue")
        .update({ status: "awaiting_otp" })
        .eq("id", applicationId)

      await persistLog(applicationId, "info", "OTP required. Automation paused. Browser session kept alive. Waiting for OTP...")

      if (onStep) {
        onStep({ status: "awaiting_otp", log: "OTP verification required. Automation paused. Waiting for OTP..." })
      }

      const otp = await waitForOtp(applicationId, onStep)

      if (otp) {
        await supabase
          .from("live_application_queue")
          .update({ status: "processing" })
          .eq("id", applicationId)

        const userJson = buildUserDataJson(userData)
        const otpPrompt = `The browser is currently on an OTP/verification code page. The code has been received.

The OTP/verification code is: ${otp}

STEPS:
1. Find the OTP/verification code input field on the current page.
2. Enter the code: ${otp}
3. Click "Verify" / "Submit" / "Confirm".
4. If the application form continues after verification, fill in any remaining REQUIRED fields using the applicant data below, then submit.
5. Wait for confirmation. DONE.

IMPORTANT:
- The OTP code is: ${otp} — enter it exactly.
- The browser is already on the OTP page. Do NOT navigate away.
- If verification succeeds and you see a confirmation, TERMINATE successfully.

APPLICANT DATA:
${JSON.stringify(userJson, null, 2)}`

        if (onStep) {
          onStep({ status: "in_progress", log: `OTP received. Resuming in same browser session...` })
        }

        // Run OTP task in the SAME browser session — browser is still on the OTP page
        const otpRun = await runTaskInSession(
          browserSessionId, otpPrompt, targetUrl, engine, 15, onStep, applicationId
        )

        finalRun = otpRun
        totalSteps += otpRun.step_count || 0
        lastRecordingUrl = otpRun.recording_url || lastRecordingUrl
        lastTaskId = otpRun.run_id || lastTaskId

        // Clear OTP from DB
        await supabase
          .from("live_application_queue")
          .update({ verification_otp: null })
          .eq("id", applicationId)
      } else {
        // OTP never arrived
        await persistLog(applicationId, "error", "OTP not provided within timeout.")
        if (onStep) {
          onStep({ status: "error", log: "OTP wait timed out. Application failed." })
        }
        return {
          success: false,
          error: "OTP verification timed out. OTP was not provided.",
          steps: totalSteps,
          recordingUrl: lastRecordingUrl,
          taskId: lastTaskId,
        }
      }
    }

    const processingTime = Date.now() - startTime
    const success = finalRun.status === "completed"
    const errorMessage = finalRun.failure_reason || null

    console.log("Skyvern task done:", { runId: lastTaskId, success, steps: totalSteps, recordingUrl: lastRecordingUrl })

    if (applicationId) {
      const resultMsg = success
        ? `Completed in ${Math.round(processingTime / 1000)}s, ${totalSteps} steps${lastRecordingUrl ? ` | Recording: ${lastRecordingUrl}` : ""}`
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
      steps: totalSteps,
      recordingUrl: lastRecordingUrl,
      taskId: lastTaskId,
    }
    } finally {
      // Always close the browser session, even on error
      await closeBrowserSession(browserSessionId)
    }
  } catch (error) {
    const processingTime = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : "Unknown error"

    console.error("Skyvern task error:", error)

    if (applicationId) {
      await persistLog(applicationId, "error", `Task error: ${errorMsg}`)

      try {
        await supabase.from("portal_metrics").insert({
          portal_type: portalType,
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

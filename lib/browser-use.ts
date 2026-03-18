import { createClient } from "@supabase/supabase-js"
import axios from "axios"
import { detectPortal } from "./portal-detector"
import type { SkyvernResponse, StreamCallback } from "./skyvern"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const BU_BASE = "https://api.browser-use.com/api/v2"

let cachedApiKey: string | null = null

async function getApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey
  try {
    const envKey = process.env.BROWSER_USE_API_KEY
    const { data } = await supabase.from("settings").select("browserUseApiKey").single()
    const dbKey = data?.browserUseApiKey
    cachedApiKey = envKey || dbKey || ""
    console.log(`[Browser Use] API key source: ${envKey ? 'env var' : 'settings table'}, key starts with: ${cachedApiKey.substring(0, 6)}...`)
    return cachedApiKey
  } catch {
    cachedApiKey = process.env.BROWSER_USE_API_KEY || ""
    console.log(`[Browser Use] API key source: env var (settings fetch failed), key starts with: ${cachedApiKey.substring(0, 6)}...`)
    return cachedApiKey
  }
}

export function clearCachedBrowserUseKey() {
  cachedApiKey = null
}

async function buRequest(method: "GET" | "POST" | "PUT" | "PATCH", path: string, body?: any): Promise<any> {
  const apiKey = await getApiKey()
  if (!apiKey) throw new Error("Browser Use API key is not configured. Set it in Settings.")
  const res = await axios({ method, url: `${BU_BASE}${path}`, headers: { "X-Browser-Use-API-Key": apiKey, "Content-Type": "application/json" }, data: body, timeout: 300000 })
  return res.data
}

async function persistLog(applicationId: string, level: string, message: string) {
  try {
    await supabase.from("application_logs").insert({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level,
      agent_id: applicationId,
      message: `[Browser Use] ${message}`,
      application_id: applicationId,
    })
  } catch (err) {
    console.error("Failed to persist log:", err)
  }
}

// ─── Browser Profile Management (one per user) ───

async function getOrCreateProfile(userId: string, userName: string): Promise<string> {
  // Check if user already has a Browser Use profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("browser_use_profile_id")
    .eq("id", userId)
    .single()

  if (profile?.browser_use_profile_id) {
    console.log(`[Browser Use] Reusing existing profile ${profile.browser_use_profile_id} for user ${userId}`)
    return profile.browser_use_profile_id
  }

  // Create a new Browser Use profile
  const res = await buRequest("POST", "/profiles", {
    name: `user-${userId}-${userName.replace(/\s+/g, "-").toLowerCase()}`,
  })

  const profileId = res.id
  console.log(`[Browser Use] Created new profile ${profileId} for user ${userId}`)

  // Save to DB for future reuse
  await supabase
    .from("profiles")
    .update({ browser_use_profile_id: profileId })
    .eq("id", userId)

  return profileId
}

// ─── Session & File Upload ───

async function createSession(profileId?: string): Promise<{ id: string; liveUrl: string | null }> {
  const body: any = {
    proxyCountryCode: "us",
    browserScreenWidth: 1920,
    browserScreenHeight: 1080,
  }
  if (profileId) body.profileId = profileId

  const res = await buRequest("POST", "/sessions", body)
  return { id: res.id, liveUrl: res.liveUrl || null }
}

async function stopSession(sessionId: string): Promise<void> {
  try {
    await buRequest("PATCH", `/sessions/${sessionId}`, { action: "stop" })
  } catch (err) {
    console.error("[Browser Use] Failed to stop session:", err)
  }
}

async function uploadResumeToSession(sessionId: string, resumeUrl: string, applicationId?: string): Promise<string | null> {
  if (!resumeUrl) return null

  try {
    // Download resume from Supabase storage
    if (applicationId) await persistLog(applicationId, "info", `Downloading resume from: ${resumeUrl}`)
    const downloadRes = await axios.get(resumeUrl, { responseType: "arraybuffer", timeout: 30000 })
    const fileBuffer = Buffer.from(downloadRes.data)
    const fileSize = fileBuffer.length

    const fileName = resumeUrl.split("/").pop() || "resume.pdf"
    console.log(`[Browser Use] Downloaded resume: ${fileName} (${fileSize} bytes)`)

    // Get presigned upload URL from Browser Use
    const presigned = await buRequest("POST", `/files/sessions/${sessionId}/presigned-url`, {
      fileName,
      contentType: "application/pdf",
      sizeBytes: fileSize,
    })

    // Upload via presigned POST (S3 form upload)
    const formData = new FormData()
    for (const [key, value] of Object.entries(presigned.fields)) {
      formData.append(key, value as string)
    }
    formData.append("file", new Blob([fileBuffer], { type: "application/pdf" }), fileName)

    await axios.post(presigned.url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60000,
    })

    const uploadedName = presigned.fileName || fileName
    console.log(`[Browser Use] Resume uploaded to session: ${uploadedName}`)
    if (applicationId) await persistLog(applicationId, "info", `Resume uploaded: ${uploadedName}`)

    return uploadedName
  } catch (err) {
    console.error("[Browser Use] Resume upload failed:", err)
    if (applicationId) await persistLog(applicationId, "warn", `Resume upload failed: ${err instanceof Error ? err.message : "Unknown error"}. Agent will try without file.`)
    return null
  }
}

// ─── Structured user data (same as Skyvern) ───

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

// ─── ATS-Specific Prompt Templates (mirroring Skyvern) ───

function buildPortalPrompt(portalName: string, userData: any, uploadedFileName: string | null): string {
  const userJson = buildUserDataJson(userData)
  const dataBlock = JSON.stringify(userJson, null, 2)

  const resumeInstruction = uploadedFileName
    ? `- A resume file "${uploadedFileName}" has been uploaded to this browser session. When the form requires a resume/CV upload or attachment, use this file. Look for buttons labeled "Upload", "Attach", "Attach Resume", "Choose File", "Browse", "Add File", or any file input field — they all work the same way. Click the button to open the file picker and select the uploaded file.`
    : `- If a resume/CV upload or attachment field is required, download the file from the resume_url provided in the applicant data and upload it. Look for buttons labeled "Upload", "Attach", "Attach Resume", "Choose File", "Browse", "Add File", or any file input field.`

  const commonRules = `
IMPORTANT RULES:
- ONLY fill fields that are MANDATORY / REQUIRED (marked with *, "required", or that block form submission). SKIP all optional fields entirely.
- Do NOT fill optional fields like "How did you hear about us", cover letter, LinkedIn URL, GitHub URL, portfolio, website, or any field not marked as required.
- For required dropdown/select fields, pick the CLOSEST matching option. If no exact match, pick the most reasonable one.
- DROPDOWN/SEARCHABLE SELECT HANDLING: When you encounter a field that has BOTH a dropdown arrow AND a text/search input, ALWAYS click the dropdown arrow or the field FIRST to open the options list, then select the matching option from the visible list. Do NOT type directly into the search box first — many searchable selects will fail or show no results if you type before opening the dropdown. The correct order is: (1) click to open dropdown, (2) if a search box appears inside the dropdown, type a few characters to filter, (3) click the matching option from the list. This applies to location fields, country selectors, phone country codes, "How did you hear" fields, and any other combo-box/searchable-select elements.
- For required acknowledgement/agreement/certification checkboxes, CHECK THEM (select "I agree" / "I acknowledge" / "I confirm").
- For work authorization: answer ONLY if the field is required.
${resumeInstruction}
- Do NOT click "Save for later" or "Save draft". Only click "Submit" / "Apply" / "Send Application".
- If a popup, modal, or cookie banner appears, DISMISS it immediately and continue.
- TERMINATE IMMEDIATELY if you see a "successfully applied" or "application received" confirmation.
- TERMINATE if you encounter a login wall that cannot be bypassed.
- SKIP EEO/demographic questions (gender, race, veteran status, disability) unless they are explicitly required and block submission.
- If you encounter a CAPTCHA (reCAPTCHA, hCaptcha, Cloudflare Turnstile, or any other challenge), SOLVE IT. Click the checkbox, complete the image challenge, or wait for it to auto-resolve. Do NOT skip or give up on captchas — always attempt to solve them before continuing.
- IMPORTANT: If after submitting the form you see an OTP/verification code page (e.g. "Enter the code sent to your email", "Verify your email", "Enter verification code"), STOP IMMEDIATELY. Do NOT try to guess or enter any code. TERMINATE the task and include the exact phrase "OTP_VERIFICATION_REQUIRED" in your final output/reason. The OTP will be fetched automatically and entered in a follow-up task.`

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
- Location fields use an autocomplete dropdown — click the field first, type a few characters of the city, wait for suggestions to appear, then click the matching suggestion. Do NOT just type and move on.
- Country/phone code selectors are dropdowns — click to open, then select from the list.
- If a CAPTCHA appears, solve it before submitting.
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
- Location and other searchable dropdowns: click the field first to open the dropdown, then type to filter, then select from the list.
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
- Ashby location fields require selecting from an autocomplete dropdown — click the field first to open the dropdown, type a few characters to filter, then click the matching option from the list. Do NOT just type the full city name and press Enter.
- Phone country code is a searchable dropdown — click the dropdown arrow first, then select the country.
- Boolean fields show as Yes/No toggle buttons, not checkboxes.
- If a CAPTCHA appears, solve it before submitting.
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
- "Source" / "How did you hear" is often required on Workday — if so, click the dropdown first, then select "Job Board" or "Internet" from the list.
- Workday uses many searchable dropdowns (country, state, degree, etc.) — always click the dropdown to open it first, then type to filter, then select from the visible options.
- If a CAPTCHA appears, solve it before proceeding to the next page.
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
- Phone fields often require selecting a phone type from a dropdown — click the dropdown first, then select "Mobile".
- Location, state, and country fields are searchable dropdowns — click to open first, then type to filter, then select from the list.
- If a CAPTCHA appears, solve it before submitting.
- If submission fails due to a missing required field, fill ONLY that field and resubmit.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    default:
      return `Fill out the job application form and submit it. Follow these general steps:

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

// ─── OTP Detection & Auto-Fetch from Inbound Emails ───

const OTP_DETECTION_KEYWORDS = [
  "otp_verification_required", "otp", "verification code", "verify your email",
  "enter the code", "confirmation code", "one-time", "one time password",
  "2fa", "two-factor", "check your email", "sent a code", "enter code", "verify code",
]

function detectOtpRequired(output: string | null): boolean {
  if (!output) return false
  const text = output.toLowerCase()
  return OTP_DETECTION_KEYWORDS.some(kw => text.includes(kw))
}

// Extract OTP (4-8 digit code) from email text
function extractOtpFromEmail(subject: string | null, bodyText: string | null, bodyHtml: string | null): string | null {
  const sources = [subject, bodyText, bodyHtml].filter(Boolean).join(" ")
  if (!sources) return null

  // Common patterns: "Your code is 123456", "OTP: 123456", standalone 4-8 digit codes
  const patterns = [
    /(?:code|otp|pin|token|password)\s*(?:is|:)\s*(\d{4,8})/i,
    /\b(\d{6})\b/,  // Most OTPs are 6 digits
    /\b(\d{4,8})\b/, // Fallback: 4-8 digits
  ]

  for (const pattern of patterns) {
    const match = sources.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

async function waitForOtp(
  applicationId: string,
  proxyEmail: string,
  taskStartTime: number,
  onStep?: StreamCallback,
  timeoutMs: number = 5 * 60 * 1000
): Promise<string | null> {
  const pollInterval = 5000
  const maxPolls = Math.ceil(timeoutMs / pollInterval)
  const cutoffTime = new Date(taskStartTime).toISOString()

  if (onStep) onStep({ status: "awaiting_otp", log: `Polling inbound emails for OTP sent to ${proxyEmail}...` })
  await persistLog(applicationId, "info", `Auto-fetching OTP from inbound_emails for ${proxyEmail} (emails after ${cutoffTime})`)

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollInterval))

    // Check inbound_emails for recent emails to this proxy address
    const { data: emails } = await supabase
      .from("inbound_emails")
      .select("subject, body_text, body_html, created_at")
      .eq("proxy_address", proxyEmail)
      .gte("created_at", cutoffTime)
      .order("created_at", { ascending: false })
      .limit(5)

    if (emails?.length) {
      for (const email of emails) {
        const otp = extractOtpFromEmail(email.subject, email.body_text, email.body_html)
        if (otp) {
          if (onStep) onStep({ status: "in_progress", log: `OTP auto-extracted: ${otp} (from email: "${email.subject}")` })
          await persistLog(applicationId, "info", `OTP auto-extracted: ${otp} from "${email.subject}"`)
          return otp
        }
      }
    }

    // Fallback: also check manual OTP entry from the UI
    const { data: manual } = await supabase
      .from("live_application_queue")
      .select("verification_otp")
      .eq("id", applicationId)
      .single()

    if (manual?.verification_otp) {
      if (onStep) onStep({ status: "in_progress", log: `OTP received (manual): ${manual.verification_otp}` })
      await persistLog(applicationId, "info", "OTP received via manual entry")
      return manual.verification_otp
    }

    if (onStep && i % 6 === 0) {
      onStep({ status: "awaiting_otp", log: `Waiting for OTP email to ${proxyEmail}... (${Math.round((i * pollInterval) / 1000)}s elapsed)` })
    }
  }

  await persistLog(applicationId, "error", `OTP wait timed out after ${timeoutMs / 1000}s for ${proxyEmail}`)
  return null
}

// ─── Task polling ───

const TERMINAL = ["finished", "stopped", "failed", "error", "timed_out"]

interface BUTaskResult {
  id: string
  status: string
  output: string | null
  steps: any[]
  live_url?: string | null
}

async function pollTaskUntilComplete(
  taskId: string,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<BUTaskResult> {
  const maxPolls = 120
  const pollInterval = 5000
  let stepCount = 0
  let liveUrl: string | null = null

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollInterval))
    stepCount++

    const taskData = await buRequest("GET", `/tasks/${taskId}`)
    const taskStatus = taskData.status
    if (!liveUrl && taskData.live_url) liveUrl = taskData.live_url
    const isTerminal = TERMINAL.includes(taskStatus)

    const steps = taskData.steps || []
    const latestStep = steps[steps.length - 1]
    const stepInfo = latestStep
      ? ` | Step ${latestStep.number}: ${latestStep.nextGoal || latestStep.url || "working..."}`
      : ""
    const logMsg = `[Poll ${stepCount}] Status: ${taskStatus} (${steps.length} steps)${stepInfo}`

    if (applicationId) await persistLog(applicationId, isTerminal && taskStatus !== "finished" ? "error" : "info", logMsg)
    if (onStep) onStep({
      step: stepCount,
      status: isTerminal ? (taskStatus === "finished" ? "completed" : "error") : "in_progress",
      log: logMsg,
      taskId,
      liveUrl,
    })

    if (isTerminal) {
      return { id: taskId, status: taskStatus, output: taskData.output || null, steps, live_url: liveUrl }
    }
  }

  throw new Error("Task polling timed out after 10 minutes")
}

// ─── Main entry point ───

export async function fillJobApplicationWithBrowserUse(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string,
  userId?: string
): Promise<SkyvernResponse> {
  const startTime = Date.now()

  cachedApiKey = null
  const apiKey = await getApiKey()
  if (!apiKey) {
    return { success: false, error: "Browser Use API key is not configured. Set it in Settings." }
  }

  const portal = detectPortal(portalUrl)
  const portalType = portal?.name || "Unknown"
  const targetUrl = portal?.getApplyUrl(portalUrl) || portalUrl

  console.log(`[Browser Use] Starting for: ${userData.name} | Portal: ${portalType} | URL: ${targetUrl}`)
  if (applicationId) await persistLog(applicationId, "info", `Starting for ${userData.name || userData.firstName} | ${portalType} portal | URL: ${targetUrl}`)
  if (onStep) onStep({ status: "session_created", log: `Creating Browser Use session for ${portalType} portal...` })

  // Create a persistent session so we can upload files and handle OTP
  let sessionId: string | null = null

  try {
    // Get or create a browser profile for this user (persistent cookies/fingerprint)
    let profileId: string | undefined
    if (userId) {
      try {
        profileId = await getOrCreateProfile(userId, userData.name || userData.firstName || "user")
        if (applicationId) await persistLog(applicationId, "info", `Using browser profile: ${profileId}`)
      } catch (err) {
        console.error("[Browser Use] Profile creation failed, continuing without profile:", err)
      }
    }

    const session = await createSession(profileId)
    sessionId = session.id
    console.log(`[Browser Use] Session created: ${sessionId}${profileId ? ` with profile ${profileId}` : ""}`)
    if (applicationId) await persistLog(applicationId, "info", `Session ${sessionId} created.`)

    // Upload resume to the session if available
    let uploadedFileName: string | null = null
    if (userData.resume) {
      if (onStep) onStep({ status: "in_progress", log: "Uploading resume to browser session..." })
      uploadedFileName = await uploadResumeToSession(sessionId, userData.resume, applicationId)
    }

    const prompt = buildPortalPrompt(portalType, userData, uploadedFileName)

    // Create task in the session
    const createRes = await buRequest("POST", "/tasks", {
      task: prompt,
      start_url: targetUrl,
      session_id: sessionId,
      vision: true,
      highlightElements: true,
      flashMode: true,
    })

    const taskId = createRes.id
    if (applicationId) await persistLog(applicationId, "info", `Task ${taskId} created in session ${sessionId}. Polling...`)
    if (onStep) onStep({ step: 0, status: "in_progress", log: `Task ${taskId} created. Polling...`, taskId })

    // Poll until terminal
    let result = await pollTaskUntilComplete(taskId, onStep, applicationId)
    let totalSteps = result.steps.length
    let liveUrl = result.live_url || session.liveUrl || null

    // ─── OTP Pause & Resume (same session) ───
    const outputText = typeof result.output === "string" ? result.output : JSON.stringify(result.output || "")
    if (applicationId && detectOtpRequired(outputText)) {
      console.log("[Browser Use] OTP detected. Session still alive. Pausing...")

      await supabase
        .from("live_application_queue")
        .update({ status: "awaiting_otp" })
        .eq("id", applicationId)

      await persistLog(applicationId, "info", "OTP required. Automation paused. Session kept alive. Waiting for OTP...")
      if (onStep) onStep({ status: "awaiting_otp", log: "OTP verification required. Automation paused. Waiting for OTP..." })

      const proxyEmail = userData.email || ""
      const otp = await waitForOtp(applicationId, proxyEmail, startTime, onStep)

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

        if (onStep) onStep({ status: "in_progress", log: "OTP received. Resuming in same browser session..." })

        // Run OTP task in the SAME session — browser is still on the OTP page
        const otpCreateRes = await buRequest("POST", "/tasks", {
          task: otpPrompt,
          session_id: sessionId,
        })

        const otpResult = await pollTaskUntilComplete(otpCreateRes.id, onStep, applicationId)
        result = otpResult
        totalSteps += otpResult.steps.length
        liveUrl = otpResult.live_url || liveUrl

        await supabase
          .from("live_application_queue")
          .update({ verification_otp: null })
          .eq("id", applicationId)
      } else {
        await persistLog(applicationId, "error", "OTP not provided within timeout.")
        if (onStep) onStep({ status: "error", log: "OTP wait timed out. Application failed." })
        return {
          success: false,
          error: "OTP verification timed out. OTP was not provided.",
          steps: totalSteps,
          recordingUrl: liveUrl,
          taskId,
        }
      }
    }

    const processingTime = Date.now() - startTime
    const success = result.status === "finished"

    if (applicationId) {
      const msg = success
        ? `Completed in ${Math.round(processingTime / 1000)}s, ${totalSteps} steps`
        : `Failed: ${result.output || result.status}`
      await persistLog(applicationId, success ? "info" : "error", msg)
    }

    return {
      success,
      result: success ? (typeof result.output === "string" ? result.output : JSON.stringify(result.output || "Application submitted")) : undefined,
      error: success ? undefined : (typeof result.output === "string" ? result.output : `Task ${result.status}`),
      steps: totalSteps,
      recordingUrl: liveUrl,
      taskId,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[Browser Use] Error:", error)
    if (applicationId) await persistLog(applicationId, "error", `Error: ${errorMsg}`)
    if (onStep) onStep({ status: "error", error: errorMsg })
    return { success: false, error: errorMsg }
  } finally {
    if (sessionId) await stopSession(sessionId)
  }
}

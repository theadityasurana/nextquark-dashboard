import { createClient } from "@supabase/supabase-js"
import axios from "axios"
import { detectPortal } from "./portal-detector"
import { fetchOtpViaApi } from "./otp-fetcher"

export interface AutomationResponse {
  success: boolean
  result?: string
  error?: string
  steps?: number
  recordingUrl?: string | null
  taskId?: string
  /**
   * Classification of a failure, when the provider produced one.
   *
   * Two things depend on it and neither could be decided from an error string:
   * whether the application is worth retrying at all, and whether the failure
   * counts against the portal's circuit breaker.
   */
  failure?: {
    failureClass: string
    rootCause: string
    suggestedAction: string
    /** Terminal for this posting — must not be re-queued. */
    permanent: boolean
    /** Evidence the portal itself is broken. Only these move the breaker. */
    portalFault: boolean
  }
}

export interface StreamCallback {
  (step: any): void
}

// ─── Portal-Specific Task Configuration ───
// Tunes Browser Use parameters per ATS to minimize steps, cost, and time.

interface PortalTaskConfig {
  useVision: boolean        // vision is expensive; simple forms don't need it
  screenWidth: number
  screenHeight: number
  maxPollCycles: number     // how long we wait before timing out
  pollIntervalMs: number
}

const PORTAL_TASK_CONFIGS: Record<string, PortalTaskConfig> = {
  Greenhouse:      { useVision: false, screenWidth: 1920, screenHeight: 1080, maxPollCycles: 60,  pollIntervalMs: 4000 },
  Lever:           { useVision: false, screenWidth: 1920, screenHeight: 1080, maxPollCycles: 50,  pollIntervalMs: 4000 },
  Ashby:           { useVision: false, screenWidth: 1920, screenHeight: 1080, maxPollCycles: 60,  pollIntervalMs: 4000 },
  Workday:         { useVision: true,  screenWidth: 1920, screenHeight: 1080, maxPollCycles: 120, pollIntervalMs: 5000 },
  iCIMS:           { useVision: true,  screenWidth: 1920, screenHeight: 1080, maxPollCycles: 100, pollIntervalMs: 5000 },
  SmartRecruiters: { useVision: true,  screenWidth: 1920, screenHeight: 1080, maxPollCycles: 80,  pollIntervalMs: 5000 },
  BambooHR:        { useVision: false, screenWidth: 1920, screenHeight: 1080, maxPollCycles: 60,  pollIntervalMs: 4000 },
  Jobvite:         { useVision: true,  screenWidth: 1920, screenHeight: 1080, maxPollCycles: 80,  pollIntervalMs: 5000 },
  LinkedIn:        { useVision: true,  screenWidth: 1920, screenHeight: 1080, maxPollCycles: 100, pollIntervalMs: 5000 },
}

const DEFAULT_TASK_CONFIG: PortalTaskConfig = {
  useVision: true, screenWidth: 1920, screenHeight: 1080, maxPollCycles: 120, pollIntervalMs: 5000,
}

function getPortalConfig(portalName: string): PortalTaskConfig {
  return PORTAL_TASK_CONFIGS[portalName] || DEFAULT_TASK_CONFIG
}

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
    // Validate the profile still exists on the API (may be gone if API key changed)
    try {
      await buRequest("GET", `/profiles/${profile.browser_use_profile_id}`)
      console.log(`[Browser Use] Reusing existing profile ${profile.browser_use_profile_id} for user ${userId}`)
      return profile.browser_use_profile_id
    } catch (err: any) {
      console.log(`[Browser Use] Cached profile ${profile.browser_use_profile_id} no longer valid (${err?.response?.status || err.message}), creating new one...`)
      await supabase.from("profiles").update({ browser_use_profile_id: null }).eq("id", userId)
    }
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

async function uploadResumeStandalone(resumeUrl: string, applicationId?: string): Promise<string | null> {
  if (!resumeUrl) return null
  try {
    if (applicationId) await persistLog(applicationId, "info", `Downloading resume from: ${resumeUrl}`)
    const downloadRes = await axios.get(resumeUrl, { responseType: "arraybuffer", timeout: 30000 })
    const fileBuffer = Buffer.from(downloadRes.data)
    const fileSize = fileBuffer.length
    const fileName = resumeUrl.split("/").pop() || "resume.pdf"
    console.log(`[Browser Use] Downloaded resume: ${fileName} (${fileSize} bytes)`)

    // Upload to Browser Use files endpoint (not tied to a session)
    const presigned = await buRequest("POST", "/files/presigned-url", {
      fileName,
      contentType: "application/pdf",
      sizeBytes: fileSize,
    })

    const formData = new FormData()
    for (const [key, value] of Object.entries(presigned.fields)) {
      formData.append(key, value as string)
    }
    formData.append("file", new Blob([fileBuffer], { type: "application/pdf" }), fileName)
    await axios.post(presigned.url, formData, { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 })

    const uploadedName = presigned.fileName || fileName
    console.log(`[Browser Use] Resume uploaded: ${uploadedName}`)
    if (applicationId) await persistLog(applicationId, "info", `Resume uploaded: ${uploadedName}`)
    return uploadedName
  } catch (err) {
    console.error("[Browser Use] Resume upload failed:", err)
    if (applicationId) await persistLog(applicationId, "warn", `Resume upload failed: ${err instanceof Error ? err.message : "Unknown error"}`)
    return null
  }
}

// ─── Structured user data ───

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

// ─── ATS-Specific Prompt Templates ───

function buildPortalPrompt(portalName: string, userData: any, uploadedFileName: string | null): string {
  const userJson = buildUserDataJson(userData)
  const dataBlock = JSON.stringify(userJson, null, 2)

  const resumeInstruction = uploadedFileName
    ? `- RESUME UPLOAD (do this FIRST before filling any text fields):
  (1) Run: document.querySelector('input[type="file"]') — the input may be hidden with opacity:0 or display:none.
  (2) If found but hidden, make it visible: el.style.display='block'; el.style.opacity='1'; then upload the file "${uploadedFileName}".
  (3) If that fails, click the visible "Attach" / "Upload" / "Choose File" button to open the native file picker and select the file.
  (4) Max 3 attempts. If all fail → TERMINATE with RESUME_UPLOAD_FAILED.
- COVER LETTER: Do NOT upload a cover letter. If separate resume and cover letter fields exist, upload resume only. If a single field says "Resume or Cover Letter", upload the resume into it.`
    : `- RESUME UPLOAD (do this FIRST before filling any text fields):
  (1) Run: document.querySelector('input[type="file"]') — the input may be hidden.
  (2) If found but hidden, make it visible and upload the file from resume_url in the applicant data.
  (3) If that fails, click the visible upload button.
  (4) Max 3 attempts. If all fail → TERMINATE with RESUME_UPLOAD_FAILED.
- COVER LETTER: Do NOT upload a cover letter. If separate resume and cover letter fields exist, upload resume only.`

  const fieldMappingEntries: string[] = [
    `- "First Name" / "Given Name" → ${userData.firstName || ""}`,
    `- "Last Name" / "Surname" / "Family Name" → ${userData.lastName || ""}`,
    `- "Full Name" / "Name" → ${userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim()}`,
    `- "Email" / "Email Address" → ${userData.email || ""}`,
    `- "Phone" / "Phone Number" / "Mobile" → ${userData.phone || ""}`,
    `- "Location" / "City" / "Current Location" → ${userData.location || ""}`,
    ...(userData.linkedinUrl ? [`- "LinkedIn" / "LinkedIn URL" → ${userData.linkedinUrl}`] : []),
    ...(userData.githubUrl ? [`- "GitHub" / "Portfolio" → ${userData.githubUrl}`] : []),
    ...(userData.workAuthorization ? [`- "Work Authorization" / "Visa Sponsorship" / "Do you require sponsorship" → ${userData.workAuthorization}`] : []),
    ...(userData.gender ? [`- "Gender" → ${userData.gender}`] : []),
    ...(userData.ethnicity ? [`- "Race" / "Ethnicity" → ${userData.ethnicity}`] : []),
    ...(userData.veteranStatus ? [`- "Veteran Status" → ${userData.veteranStatus}`] : []),
    ...(userData.disabilityStatus ? [`- "Disability" / "Disability Status" → ${userData.disabilityStatus}`] : []),
    ...(userData.salaryMin && userData.salaryMax ? [`- "Salary" / "Expected Salary" / "Compensation" → ${userData.salaryCurrency || "USD"} ${userData.salaryMin} - ${userData.salaryMax}`] : []),
    `- "How did you hear about us" / "Source" → "Job Board"`,
    `- "Start Date" / "Availability" → "Immediately"`,
    `- Any acknowledgement / agreement checkbox → Check it / select "Yes" / "I agree"`,
  ]
  const fieldMapping = `
FIELD-TO-VALUE MAPPING — Match form field labels to these values:
${fieldMappingEntries.join("\n")}`

  const commonRules = `
${fieldMapping}

IMPORTANT RULES:
- PRE-FLIGHT: Before filling anything, confirm the page is for the intended job. If the job is closed or unavailable → TERMINATE with JOB_CLOSED. If the page is a different job → TERMINATE with WRONG_JOB.
- Press End immediately on page load to skip to form fields. Do NOT read the job description.
- ONLY fill REQUIRED fields (marked with * or "required"). SKIP all optional fields entirely.
- Fill ONE field at a time, top to bottom. Verify dropdowns and file uploads before moving on.
${resumeInstruction}
- DROPDOWNS: Never type into a dropdown. Always: (1) click to open, (2) read the available options, (3) pick the closest match by meaning (not text). For searchable dropdowns, use the search input inside the panel. Click the CENTER of the option row, not just the text label.
- AUTOCOMPLETE FIELDS: If suggestions appear while typing, click the matching suggestion — do not just type and move on.
- Phone country code: the phone field has a separate country code dropdown (flag/+XX). Open it, search for "+91", select India (+91), then type the phone number digits only.
- Location fields: click the field, type a few characters, wait for suggestions, click the matching suggestion.
- Do NOT clear already-filled fields. If fixing a validation error, fill ONLY the empty/errored field.
- SKIP EEO/demographic questions (gender, race, veteran, disability) unless they block submission.
- Dismiss any popup, modal, or cookie banner immediately.
- PRE-SUBMIT VERIFICATION: Before clicking the submit button, scroll through the entire form from top to bottom and verify every required field (marked with * or "required") has a value. Check: (1) text inputs are not empty, (2) dropdowns show a selected value (not a placeholder like "Select..."), (3) the resume file is attached. If any required field is empty or shows a placeholder, fill it now before submitting. Only proceed to submit once all required fields are confirmed filled.
- Do NOT click "Save for later" or "Save draft". Only click "Submit" / "Apply" / "Send Application".
- TERMINATE immediately on "successfully applied" or "application received" confirmation.
- TERMINATE if you hit a login wall that cannot be bypassed.
- ⚠️ OTP (HIGHEST PRIORITY): If you see any OTP/verification code prompt at ANY point → TERMINATE immediately with "OTP_VERIFICATION_REQUIRED". This overrides all other rules.`

  switch (portalName) {
    case "Greenhouse":
      return `You are on a Greenhouse job application page. This is a SINGLE-PAGE form.

STEPS:
1. Press End to jump to the form. Do NOT read the job description.
2. Upload resume FIRST (before filling any text fields) — see RESUME UPLOAD rule below.
3. Fill required fields: First Name → "${userData.firstName}", Last Name → "${userData.lastName}", Email → "${userData.email}", Phone → "${userData.phone}".
4. Answer ONLY required custom questions (marked with * or "required"). SKIP optional ones.
5. SKIP: LinkedIn, Website, Cover Letter, "How did you hear", EEO/demographic section — unless explicitly required.
6. Before submitting, scroll through the form top to bottom and confirm every required field is filled and the resume is attached. Fill any missed required fields.
7. Click "Submit Application" and wait for confirmation. DONE.

KNOWN QUIRKS:
- Single-page form — no "Next" button.
- Location fields: click, type a few chars, wait for autocomplete suggestions, click the match.
- Phone country code: open the dropdown, search "+91", select India (+91), then type the number.
- If submission fails on a missing field, fill ONLY that field and resubmit.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    case "Lever":
      return `You are on a Lever job application page. Navigate to the /apply page if not already there.

STEPS:
1. Do NOT read the job description. IMMEDIATELY scroll to the bottom and click the "Apply for this job" button. If already on the /apply page, skip to step 2.
2. Fill in required fields using the FIELD-TO-VALUE MAPPING: Full Name → "${userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim()}", Email → "${userData.email}", Phone → "${userData.phone}".
3. Upload resume using the uploaded file. SKIP the cover letter upload/text field.
4. SKIP: LinkedIn URL, GitHub URL, Additional Information — unless marked required.
5. Answer ONLY custom questions that are marked as required. SKIP all optional ones.
6. Check ONLY required checkboxes.
7. SKIP: EEO section (gender, race, veteran status) — these are always optional on Lever.
8. Click "Submit Application".
9. Wait for confirmation. DONE.

KNOWN QUIRKS:
- Lever uses a SINGLE full name field, not separate first/last name. Combine them.
- The resume upload may be a drag-and-drop area — click it to open the file picker.
- Location and other searchable dropdowns: click the field first to open the dropdown, then type to filter, then select from the list.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    case "Ashby":
      return `You are on an Ashby job application page.

STEPS:
1. IMMEDIATELY scroll to the bottom of the page to find the application form. Do NOT read the job description, requirements, or any text above the form. Skip everything until you see form input fields.
2. Fill in required fields using the FIELD-TO-VALUE MAPPING: First Name → "${userData.firstName}", Last Name → "${userData.lastName}" (or Full Name → "${userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim()}"), Email → "${userData.email}", Phone → "${userData.phone}".
3. Upload resume using the uploaded file. SKIP the cover letter upload field.
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
- If submission fails due to a missing required field, fill ONLY that field and resubmit.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    case "Workday":
      return `You are on a Workday job application page. This is a MULTI-PAGE form with several steps.

STEPS:
1. Do NOT read the job description. IMMEDIATELY find and click "Apply" or "Apply Manually". The button is usually at the top or bottom of the page. Do NOT click "Apply with LinkedIn".
2. If there's a "Sign In" page, look for "Create Account" or "Apply without account". If forced to sign in, use the applicant's email: "${userData.email}".
3. The form has MULTIPLE PAGES. On each page, fill ONLY the required/mandatory fields (marked with * or "required") using the FIELD-TO-VALUE MAPPING, then click "Next" / "Continue".
4. SKIP all optional fields on every page. Do NOT fill optional experience, education, or additional info unless required.
5. Upload resume using the uploaded file. If "My Experience" offers resume auto-fill, USE IT to save steps. SKIP the cover letter upload field.
6. On the Review page, click "Submit" immediately.
7. Wait for confirmation. DONE.

KNOWN QUIRKS:
- Workday forms are MULTI-PAGE. Always click "Next"/"Continue" after filling required fields.
- "Source" / "How did you hear" is often required on Workday — if so, click the dropdown first, then select "Job Board" or "Internet" from the list.
- Workday uses many searchable dropdowns (country, state, degree, etc.) — always click the dropdown to open it first, then type to filter, then select from the visible options.
- If submission fails due to a missing required field, fill ONLY that field and resubmit.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    case "iCIMS":
      return `You are on an iCIMS job application page. This may be a multi-step form.

STEPS:
1. Do NOT read the job description. IMMEDIATELY find and click "Apply" or "Apply Now". Scroll down quickly if the button is not visible.
2. Look for "Apply as Guest" or "Continue without signing in" if available.
3. Fill in required fields using the FIELD-TO-VALUE MAPPING: First Name → "${userData.firstName}", Last Name → "${userData.lastName}", Email → "${userData.email}", Phone → "${userData.phone}". Fill address ONLY if required, using Location → "${userData.location}".
4. Upload resume using the uploaded file. SKIP the cover letter upload field.
5. SKIP optional work experience and education pages — click "Next" / "Skip" if possible.
6. Answer ONLY required screening questions. SKIP optional ones.
7. SKIP EEO/demographic questions — these are always optional.
8. Click "Submit Application".
9. Wait for confirmation. DONE.

KNOWN QUIRKS:
- iCIMS often requires account creation — look for guest/quick apply options first.
- Phone fields often require selecting a phone type from a dropdown — click the dropdown first, then select "Mobile".
- Location, state, and country fields are searchable dropdowns — click to open first, then type to filter, then select from the list.
- If submission fails due to a missing required field, fill ONLY that field and resubmit.
${commonRules}

APPLICANT DATA:
${dataBlock}`

    default:
      return `Fill out the job application form and submit it. Follow these general steps:

STEPS:
1. Do NOT read the job description or any non-form content. IMMEDIATELY scroll to the bottom of the page to find the application form or an "Apply" button. If you see an "Apply" / "Apply Now" / "Apply for this job" button, click it right away.
2. Fill in mandatory/required fields using the FIELD-TO-VALUE MAPPING provided. Match each form field label to the mapping and enter the corresponding value.
3. Upload resume using the uploaded file. SKIP the cover letter upload field.
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

// ─── OTP Detection ───

const OTP_MANAGER_URL = "https://admin.nextquark.in/otp-manager"

const OTP_DETECTION_KEYWORDS = [
  "otp_verification_required", "otp", "verification code", "verify your email",
  "enter the code", "confirmation code", "one-time", "one time password",
  "2fa", "two-factor", "check your email", "sent a code", "enter code", "verify code",
]

const CAPTCHA_DETECTION_KEYWORDS = [
  "captcha", "recaptcha", "hcaptcha", "cloudflare turnstile",
  "i am not a robot", "verify you are human", "human verification",
  "cannot solve captcha", "solve it manually", "please solve",
  "find all", "select all images", "image challenge", "captcha_verification_required",
]

function detectCaptchaFromResult(result: BUTaskResult): boolean {
  const allText = [
    typeof result.output === "string" ? result.output : JSON.stringify(result.output || ""),
    ...(result.steps || []).map((step: any) =>
      [step.nextGoal, step.output, step.description, step.url, step.error, step.reason]
        .filter(Boolean).join(" ")
    ),
  ].join(" ").toLowerCase()
  return CAPTCHA_DETECTION_KEYWORDS.some(kw => allText.includes(kw))
}

function detectOtpRequired(output: string | null): boolean {
  if (!output) return false
  const text = output.toLowerCase()
  return OTP_DETECTION_KEYWORDS.some(kw => text.includes(kw))
}

// Build the prompt for the agent to fetch OTP from the admin panel tab
function buildOtpFetchPrompt(applicationId: string, proxyEmail: string): string {
  return `You need to retrieve an OTP/verification/security code from the OTP Manager admin panel.

STEPS:
1. You should now be on the OTP Manager page (${OTP_MANAGER_URL}). If not, navigate to it.
2. IMPORTANT: The page might initially show "No inbound emails found" or "0 records" — IGNORE this message completely. The table data may take a moment to load, or the UI may not reflect the actual data. Always look at the actual table rows regardless of what the page header or empty state says.
3. Click the "Refresh" button on the page to reload the latest emails. Wait a few seconds for the table to update.
4. Look at the table on the page. The table has columns: ID, Live App Queue ID, User ID, Proxy Address, From Email, Body Text, Body HTML, Extracted OTP.
5. Find the row where the "Live App Queue ID" column matches: "${applicationId}"
   - This is the MOST IMPORTANT filter. Match by Live App Queue ID first.
   - If no row matches by Live App Queue ID, fall back to matching by "Proxy Address" = "${proxyEmail}" and use the most recent row.
6. Once you find the matching row, look at the "Extracted OTP" column FIRST. If it has a value (a badge/highlighted code), that is the OTP — use it directly. This is the most reliable source.
7. If the "Extracted OTP" column is empty (shows a dash "—"), then read the "Body Text" column and extract the code manually. It can be a 4-10 character code that is either purely numeric (e.g. 123456), purely alphabetic (e.g. RvnyAyws), or alphanumeric (e.g. Ab3xK9). It is often near words like "code", "OTP", "verification", "verify", "security code".
8. Remember the OTP code.
9. Switch back to the first browser tab (the application page).
10. Output the OTP code as your final result in this exact format: OTP_CODE=<the code>

IMPORTANT:
- IGNORE any "No inbound emails found" or "0 records" message on the page — it may be a UI glitch. Always click Refresh and look at the actual table rows.
- If no matching row is found after refreshing, wait 10 seconds, click Refresh again, and check the table again. Repeat up to 5 times.
- ALWAYS match by "Live App Queue ID" = "${applicationId}" first. This ensures you get the OTP for the correct application.
- ALWAYS check the "Extracted OTP" column first — it already has the code extracted for you.
- Do NOT enter the OTP on the application page yet — just extract and output it.`
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
  applicationId?: string,
  config?: PortalTaskConfig
): Promise<BUTaskResult> {
  const cfg = config || DEFAULT_TASK_CONFIG
  const maxPolls = cfg.maxPollCycles
  const pollInterval = cfg.pollIntervalMs
  let stepCount = 0
  let liveUrl: string | null = null

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollInterval))
    stepCount++

    const taskData = await buRequest("GET", `/tasks/${taskId}`)
    const taskStatus = taskData.status
    if (!liveUrl && taskData.live_url) {
      liveUrl = taskData.live_url
      // Persist live_url to DB immediately on first availability
      if (applicationId) {
        supabase
          .from("live_application_queue")
          .update({ live_url: liveUrl })
          .eq("id", applicationId)
          .then(() => {})
          .catch(() => {})
      }
    }
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

  const timeoutMins = Math.round((maxPolls * pollInterval) / 60000)
  throw new Error(`Task polling timed out after ${timeoutMins} minutes`)
}

// ─── Main entry point ───

export async function fillJobApplicationWithBrowserUse(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string,
  userId?: string
): Promise<AutomationResponse> {
  const startTime = Date.now()

  cachedApiKey = null
  const apiKey = await getApiKey()
  if (!apiKey) {
    return { success: false, error: "Browser Use API key is not configured. Set it in Settings." }
  }

  const portal = detectPortal(portalUrl)
  const portalType = portal?.name || "Unknown"
  const targetUrl = portal?.getApplyUrl(portalUrl) || portalUrl
  const portalConfig = getPortalConfig(portalType)

  console.log(`[Browser Use] Starting for: ${userData.name} | Portal: ${portalType} | URL: ${targetUrl} | Config: vision=${portalConfig.useVision}, ${portalConfig.screenWidth}x${portalConfig.screenHeight}`)
  if (applicationId) await persistLog(applicationId, "info", `Starting for ${userData.name || userData.firstName} | ${portalType} portal (vision=${portalConfig.useVision}) | URL: ${targetUrl}`)
  if (onStep) onStep({ status: "session_created", log: `Creating Browser Use task for ${portalType} portal (vision=${portalConfig.useVision})...` })

  let taskId: string | undefined

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

    // Upload resume standalone (not tied to a session) so Browser Use provisions its own stealth browser
    let uploadedFileName: string | null = null
    if (userData.resume) {
      if (onStep) onStep({ status: "in_progress", log: "Uploading resume..." })
      uploadedFileName = await uploadResumeStandalone(userData.resume, applicationId)
    }

    const prompt = buildPortalPrompt(portalType, userData, uploadedFileName)

    // Create task WITHOUT session_id — Browser Use provisions its own stealth browser
    // which activates built-in CAPTCHA bypass via proxy + fingerprint spoofing
    const taskBody: any = {
      task: prompt,
      start_url: targetUrl,
      vision: portalConfig.useVision,
      highlightElements: true,
      flashMode: !portalConfig.useVision,
      proxy: { country_code: "us" },
    }
    if (profileId) taskBody.profile_id = profileId

    const createRes = await buRequest("POST", "/tasks", taskBody)
    taskId = createRes.id
    const liveUrlFromTask = createRes.live_url || null

    if (applicationId) {
      await persistLog(applicationId, "info", `Task ${taskId} created. Polling...`)
      if (liveUrlFromTask) {
        await supabase.from("live_application_queue").update({ live_url: liveUrlFromTask }).eq("id", applicationId)
      }
    }
    if (onStep) onStep({ step: 0, status: "in_progress", log: `Task ${taskId} created. Polling...`, taskId, liveUrl: liveUrlFromTask })

    // Poll until terminal (with portal-tuned intervals)
    let result = await pollTaskUntilComplete(taskId!, onStep, applicationId, portalConfig)
    let totalSteps = result.steps.length
    let liveUrl = result.live_url || liveUrlFromTask || null

    if (applicationId && liveUrl) {
      await supabase.from("live_application_queue").update({ live_url: liveUrl }).eq("id", applicationId)
    }

    // ─── CAPTCHA Pause (same session, human solves it) ───
    if (applicationId && detectCaptchaFromResult(result)) {
      console.log("[Browser Use] CAPTCHA detected. Pausing for human intervention...")

      await supabase
        .from("live_application_queue")
        .update({ status: "awaiting_captcha", live_url: liveUrl })
        .eq("id", applicationId)

      await persistLog(applicationId, "info", `CAPTCHA detected. Session kept alive. Live URL: ${liveUrl || 'N/A'}. Waiting for human to solve...`)
      if (onStep) onStep({
        status: "awaiting_captcha",
        log: "CAPTCHA detected. Browser session is still live — a human operator can connect and solve it.",
        liveUrl,
      })

      // Poll until human marks status back to "processing"
      while (true) {
        await new Promise(r => setTimeout(r, 10_000))
        const { data: queueRow } = await supabase
          .from("live_application_queue")
          .select("status")
          .eq("id", applicationId)
          .single()
        if (queueRow?.status === "processing") {
          await persistLog(applicationId, "info", "CAPTCHA solved by human. Resuming automation...")
          if (onStep) onStep({ status: "in_progress", log: "CAPTCHA solved. Resuming automation..." })
          break
        }
      }

      // Resume in the same session from where the agent left off
      const userJson = buildUserDataJson(userData)
      const continuePrompt = `The CAPTCHA on this page has been solved by a human operator. The browser is still on the application page.

Continue filling out the application form from where it was left off. Fill ONLY MANDATORY/REQUIRED fields.

STEPS:
1. Look at the current state of the form.
2. If there are remaining required fields that are empty, fill them using the applicant data below.
3. If the form has a "Next" / "Continue" button, click it and fill required fields on subsequent pages.
4. Click "Submit" / "Apply" / "Send Application" on the final page.
5. Wait for confirmation. DONE.

APPLICANT DATA:
${JSON.stringify(userJson, null, 2)}`

      const continueRes = await buRequest("POST", "/tasks", {
        task: continuePrompt,
        vision: portalConfig.useVision,
        proxy: { country_code: "us" },
        ...(profileId ? { profile_id: profileId } : {}),
      })

      const continueResult = await pollTaskUntilComplete(continueRes.id, onStep, applicationId, portalConfig)
      result = continueResult
      totalSteps += continueResult.steps.length
      liveUrl = continueResult.live_url || liveUrl
    }

    // ─── OTP Pause & Resume (same session) ───
    const outputTextForOtp = typeof result.output === "string" ? result.output : JSON.stringify(result.output || "")
    if (applicationId && detectOtpRequired(outputTextForOtp)) {
      console.log("[Browser Use] OTP detected. Trying API-based fetch first...")

      await supabase
        .from("live_application_queue")
        .update({ status: "awaiting_otp" })
        .eq("id", applicationId)

      await persistLog(applicationId, "info", "OTP required. Attempting API-based OTP fetch (webhook + Resend API)...")
      if (onStep) onStep({ status: "awaiting_otp", log: "OTP verification required. Fetching via API..." })

      const proxyEmail = userData.email || ""

      // ── NEW METHOD: API-based OTP fetch (webhook fills DB, or Resend List API) ──
      let otp = await fetchOtpViaApi(applicationId, proxyEmail, 45000)

      // ── FALLBACK: Browser-based OTP fetch from admin panel ──
      if (!otp) {
        await persistLog(applicationId, "info", "API-based OTP fetch failed. Falling back to browser-based method...")
        if (onStep) onStep({ status: "awaiting_otp", log: "API fetch failed. Falling back to browser-based OTP extraction..." })

        const openAndFetchPrompt = `STEP A: Open a new browser tab and navigate to ${OTP_MANAGER_URL}.
STEP B: Once the page loads, follow these instructions:
${buildOtpFetchPrompt(applicationId, proxyEmail)}`
        const otpFetchRes = await buRequest("POST", "/tasks", {
          task: openAndFetchPrompt,
          vision: true,
          ...(profileId ? { profile_id: profileId } : {}),
        })

        const otpFetchResult = await pollTaskUntilComplete(otpFetchRes.id, onStep, applicationId)
        totalSteps += otpFetchResult.steps.length

        const otpOutput = typeof otpFetchResult.output === "string" ? otpFetchResult.output : JSON.stringify(otpFetchResult.output || "")
        const otpMatch = otpOutput.match(/OTP_CODE=([A-Za-z0-9]{4,10})/)
        otp = otpMatch?.[1] || null
      }

      if (otp) {
        await persistLog(applicationId, "info", `OTP obtained: ${otp}`)
        if (onStep) onStep({ status: "in_progress", log: `OTP extracted: ${otp}. Entering on application page...` })

        await supabase
          .from("live_application_queue")
          .update({ status: "processing" })
          .eq("id", applicationId)

        const userJson = buildUserDataJson(userData)
        const otpEntryPrompt = `The browser should now be on the first tab (the application page) showing an OTP/verification code input.

The OTP/verification code is: ${otp}

STEPS:
1. Make sure you are on the first browser tab (the application page). If not, switch to it.
2. Find the OTP/verification code input field on the current page.
3. Enter the code: ${otp}
4. Click "Verify" / "Submit" / "Confirm".
5. If the application form continues after verification, fill in any remaining REQUIRED fields using the applicant data below, then submit.
6. Wait for confirmation. DONE.

IMPORTANT:
- The OTP code is: ${otp} — enter it exactly.
- If verification succeeds and you see a confirmation, TERMINATE successfully.

APPLICANT DATA:
${JSON.stringify(userJson, null, 2)}`

        const otpEntryRes = await buRequest("POST", "/tasks", {
          task: otpEntryPrompt,
          vision: true,
          ...(profileId ? { profile_id: profileId } : {}),
        })

        const otpEntryResult = await pollTaskUntilComplete(otpEntryRes.id, onStep, applicationId)
        result = otpEntryResult
        totalSteps += otpEntryResult.steps.length
        liveUrl = otpEntryResult.live_url || liveUrl

        await supabase
          .from("live_application_queue")
          .update({ verification_otp: null })
          .eq("id", applicationId)
      } else {
        await persistLog(applicationId, "error", "Could not extract OTP via API or browser fallback.")
        if (onStep) onStep({ status: "error", log: "Failed to extract OTP. Application failed." })
        return {
          success: false,
          error: "OTP extraction failed via both API and browser methods.",
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
  }
}

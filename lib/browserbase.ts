import { createClient } from "@supabase/supabase-js"
import axios from "axios"
import { detectPortal } from "./portal-detector"
import type { AutomationResponse, StreamCallback } from "./browser-use"
import { fetchOtpViaApi } from "./otp-fetcher"
import Browserbase from "@browserbasehq/sdk"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Portal-Specific Configuration ───
interface PortalConfig {
  maxSteps: number
  timeout: number       // session timeout in seconds
  model: string
}

const PORTAL_CONFIGS: Record<string, PortalConfig> = {
  Greenhouse:      { maxSteps: 20, timeout: 300,  model: "google/gemini-2.5-flash" },
  Lever:           { maxSteps: 20, timeout: 300,  model: "google/gemini-2.5-flash" },
  Ashby:           { maxSteps: 20, timeout: 300,  model: "google/gemini-2.5-flash" },
  Workday:         { maxSteps: 40, timeout: 600,  model: "google/gemini-2.5-flash" },
  iCIMS:           { maxSteps: 35, timeout: 480,  model: "google/gemini-2.5-flash" },
  SmartRecruiters: { maxSteps: 30, timeout: 420,  model: "google/gemini-2.5-flash" },
  BambooHR:        { maxSteps: 25, timeout: 300,  model: "google/gemini-2.5-flash" },
  Jobvite:         { maxSteps: 30, timeout: 420,  model: "google/gemini-2.5-flash" },
  LinkedIn:        { maxSteps: 35, timeout: 480,  model: "google/gemini-2.5-flash" },
}

const DEFAULT_PORTAL_CONFIG: PortalConfig = { maxSteps: 30, timeout: 420, model: "google/gemini-2.5-flash" }

function getPortalConfig(portalName: string): PortalConfig {
  return PORTAL_CONFIGS[portalName] || DEFAULT_PORTAL_CONFIG
}

// ─── Persistent Browser Context Management ───
async function getOrCreateBrowserbaseContext(userId: string, bb: InstanceType<typeof Browserbase>): Promise<string | null> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("browserbase_context_id")
      .eq("id", userId)
      .single()

    if (profile?.browserbase_context_id) {
      // Validate context still exists
      try {
        await bb.contexts.retrieve(profile.browserbase_context_id)
        console.log(`[Browserbase] Reusing context ${profile.browserbase_context_id} for user ${userId}`)
        return profile.browserbase_context_id
      } catch {
        console.log(`[Browserbase] Cached context invalid, creating new one...`)
        await supabase.from("profiles").update({ browserbase_context_id: null }).eq("id", userId)
      }
    }

    // Create new context
    const context = await bb.contexts.create()
    console.log(`[Browserbase] Created new context ${context.id} for user ${userId}`)
    await supabase.from("profiles").update({ browserbase_context_id: context.id }).eq("id", userId)
    return context.id
  } catch (err) {
    console.error("[Browserbase] Context management failed:", err)
    return null
  }
}

// ─── Cached keys ───
let cachedBrowserbaseApiKey: string | null = null
let cachedBrowserbaseProjectId: string | null = null
let cachedGeminiApiKey: string | null = null

async function getKeys(): Promise<{ apiKey: string; projectId: string; geminiKey: string }> {
  if (cachedBrowserbaseApiKey && cachedBrowserbaseProjectId && cachedGeminiApiKey) {
    return { apiKey: cachedBrowserbaseApiKey, projectId: cachedBrowserbaseProjectId, geminiKey: cachedGeminiApiKey }
  }
  try {
    const { data } = await supabase.from("settings").select("*").single()
    cachedBrowserbaseApiKey = process.env.BROWSERBASE_API_KEY || data?.browserbaseApiKey || ""
    cachedBrowserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID || data?.browserbaseProjectId || ""
    cachedGeminiApiKey = process.env.GEMINI_API_KEY || data?.geminiApiKey || ""
  } catch {
    cachedBrowserbaseApiKey = process.env.BROWSERBASE_API_KEY || ""
    cachedBrowserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID || ""
    cachedGeminiApiKey = process.env.GEMINI_API_KEY || ""
  }
  return { apiKey: cachedBrowserbaseApiKey!, projectId: cachedBrowserbaseProjectId!, geminiKey: cachedGeminiApiKey! }
}

export function clearCachedBrowserbaseKeys() {
  cachedBrowserbaseApiKey = null
  cachedBrowserbaseProjectId = null
  cachedGeminiApiKey = null
}

// ─── Logging ───
async function persistLog(applicationId: string, level: string, message: string) {
  try {
    await supabase.from("application_logs").insert({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level,
      agent_id: applicationId,
      message: `[Browserbase] ${message}`,
      application_id: applicationId,
    })
  } catch (err) {
    console.error("Failed to persist log:", err)
  }
}

// ─── User data builder ───
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

// ─── OTP/CAPTCHA detection ───
const OTP_KEYWORDS = ["otp_verification_required", "otp", "verification code", "verify your email", "enter the code", "confirmation code"]
const CAPTCHA_KEYWORDS = ["captcha_verification_required", "captcha", "recaptcha", "hcaptcha"]

function detectOtp(text: string): boolean {
  const lower = text.toLowerCase()
  return OTP_KEYWORDS.some(kw => lower.includes(kw))
}

function detectCaptcha(text: string): boolean {
  const lower = text.toLowerCase()
  return CAPTCHA_KEYWORDS.some(kw => lower.includes(kw))
}

// ─── System prompt for the form-filling agent ───
const FORM_FILLING_SYSTEM_PROMPT = `You are an expert job application form filler. Your job is to fill out job application forms quickly and accurately.

BEHAVIOR RULES:
- Fill ONLY required/mandatory fields (marked with *, "required", or that block submission). SKIP all optional fields.
- For text inputs: click the field and type the value directly.
- For dropdowns/selects: click to open, read the available options, then select the CLOSEST matching option using semantic matching. Never type into a dropdown.
- For searchable dropdowns (location, country, etc.): click to open, type a few characters to filter, then click the matching suggestion.
- For phone country code dropdowns: click the flag/code area, search for the country, select it, then type the phone number in the number field.
- For checkboxes (agreements, acknowledgements): check them if required.
- For radio buttons: select the most appropriate option based on the applicant data.
- Use semantic matching — choose options that convey similar meaning even if exact wording differs.
- NEVER re-fill a field that already has a value.
- Dismiss any popups, cookie banners, or modals immediately.
- After filling all required fields, click the Submit/Apply/Send Application button.
- If you encounter a CAPTCHA, STOP and output "CAPTCHA_VERIFICATION_REQUIRED".
- If you encounter an OTP/verification code prompt, STOP and output "OTP_VERIFICATION_REQUIRED".
- Fill fields ONE AT A TIME in order from top to bottom. Verify each field is filled before moving to the next.
- NEVER type into dropdown fields — always click to open first, then select from visible options.
- For autocomplete/typeahead fields, type a few characters, wait for suggestions, then click the matching suggestion.
- Do NOT read or scroll through job descriptions. Skip directly to the form.
- Do NOT clear or re-interact with already-filled fields.`

// ─── Portal-Specific Instruction Builder ───
function buildPortalInstruction(portalType: string, userData: any, resumeUploaded: boolean): string {
  const fullName = userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim()
  const resumeNote = resumeUploaded
    ? "The resume has already been uploaded — do NOT click or interact with any file upload buttons or resume/CV fields."
    : "For the resume upload, look for a hidden input[type=file] and set the file. Do NOT click visible upload buttons — they open native dialogs that block automation."

  const commonRules = `
CRITICAL RULES:
- Do NOT click any file upload buttons or "ATTACH" links — this opens a native dialog that blocks automation.${resumeUploaded ? " The resume is already uploaded." : ""}
- Do NOT click "Apply with LinkedIn".
- Do NOT call done/finish until you have filled ALL required fields and clicked Submit.
- Fill fields one by one: click the field, then type the value. Verify before moving on.
- You MUST fill at least the name, email, and phone fields before submitting.
- For dropdown fields: ALWAYS click to open first, read available options, then select the closest match. NEVER type directly into a dropdown.
- For searchable dropdowns (location, country code, etc.): click to open, type a few characters to filter, then click the matching suggestion from the list.
- For phone country code: click the flag/dropdown, search for the country, select it, then type the number in the phone field.
- SKIP all optional fields. Only fill fields marked required (*, "required", or that block submission).
- SKIP EEO/demographic questions (gender, race, veteran, disability) unless they explicitly block submission.
- If you see a CAPTCHA, output "CAPTCHA_VERIFICATION_REQUIRED" and stop.
- If you see an OTP/verification prompt, output "OTP_VERIFICATION_REQUIRED" and stop.
- Do NOT re-fill fields that already have values.
- Dismiss any popups, cookie banners, or modals immediately.`

  const applicantData = `
APPLICANT DATA:
- First Name: ${userData.firstName || ""}
- Last Name: ${userData.lastName || ""}
- Full Name: ${fullName}
- Email: ${userData.email || ""}
- Phone: ${userData.phone || ""}
- Location: ${userData.location || ""}
- LinkedIn URL: ${userData.linkedinUrl || ""}
- GitHub URL: ${userData.githubUrl || ""}
- Current Company: ${userData.currentCompany || "Freelance"}
- Work Authorization: ${userData.workAuthorization || "Authorized to work"}`

  switch (portalType) {
    case "Greenhouse":
      return `You are on a Greenhouse job application page. This is a SINGLE-PAGE form.

STEPS:
1. IMMEDIATELY scroll to the bottom of the page to find the application form. Do NOT read the job description.
2. Fill required fields: First Name → "${userData.firstName}", Last Name → "${userData.lastName}", Email → "${userData.email}", Phone → "${userData.phone}".
3. ${resumeNote}
4. Answer ONLY custom questions marked as required (*). SKIP all optional questions.
5. SKIP: LinkedIn URL, Website, Cover Letter, "How did you hear" — unless explicitly marked required.
6. SKIP: EEO/demographic section — always optional on Greenhouse.
7. Click "Submit Application".
8. Wait for confirmation. DONE.

GREENHOUSE QUIRKS:
- Single-page form. Do NOT look for a "Next" button.
- Location fields use autocomplete — type a few characters, wait for suggestions, click the match.
- Country/phone code selectors are dropdowns — click to open, then select.
${commonRules}
${applicantData}`

    case "Lever":
      return `You are on a Lever job application page. Navigate to the /apply page if not already there.

STEPS:
1. Do NOT read the job description. If not on /apply page, click "Apply for this job".
2. Fill required fields: Full Name → "${fullName}", Email → "${userData.email}", Phone → "${userData.phone}".
3. ${resumeNote}
4. SKIP: LinkedIn URL, GitHub URL, Additional Information, Cover Letter — unless marked required.
5. Answer ONLY required custom questions. SKIP optional ones.
6. Check ONLY required checkboxes.
7. SKIP: EEO section — always optional on Lever.
8. Click "Submit Application".
9. Wait for confirmation. DONE.

LEVER QUIRKS:
- Uses a SINGLE full name field, not separate first/last. Use: "${fullName}".
- Resume upload may be a drag-and-drop area — click it to open file picker.
- Location fields are searchable dropdowns — click first, type to filter, select from list.
${commonRules}
${applicantData}`

    case "Ashby":
      return `You are on an Ashby job application page.

STEPS:
1. IMMEDIATELY scroll to the bottom to find the application form. Do NOT read the job description.
2. Fill required fields: First Name → "${userData.firstName}", Last Name → "${userData.lastName}" (or Full Name → "${fullName}"), Email → "${userData.email}", Phone → "${userData.phone}".
3. ${resumeNote}
4. SKIP: LinkedIn URL, Location — unless marked required.
5. Answer ONLY required custom questions. SKIP optional ones.
6. Check ONLY required checkboxes (e.g., arbitration agreements that block submission).
7. Click "Submit".
8. If a separate EEO/demographic survey appears AFTER submission, SKIP it (click "Skip" or close).
9. Wait for confirmation. DONE.

ASHBY QUIRKS:
- Location fields require selecting from autocomplete — type a few chars, wait, click the match.
- Phone country code is a searchable dropdown — click the dropdown arrow, then select.
- Boolean fields show as Yes/No toggle buttons, not checkboxes.
${commonRules}
${applicantData}`

    case "Workday":
      return `You are on a Workday job application page. This is a MULTI-PAGE form with several steps.

STEPS:
1. Do NOT read the job description. Find and click "Apply" or "Apply Manually". Do NOT click "Apply with LinkedIn".
2. If there's a "Sign In" page, look for "Create Account" or "Apply without account".
3. The form has MULTIPLE PAGES. On each page, fill ONLY required fields (marked with *), then click "Next" / "Continue".
4. SKIP all optional fields on every page.
5. ${resumeNote} If "My Experience" offers resume auto-fill, USE IT.
6. On the Review page, click "Submit" immediately.
7. Wait for confirmation. DONE.

WORKDAY QUIRKS:
- MULTI-PAGE form. Always click "Next"/"Continue" after filling required fields on each page.
- "Source" / "How did you hear" is often required — select "Job Board" or "Internet" from dropdown.
- Uses many searchable dropdowns (country, state, degree) — always click to open first, type to filter, then select.
- May require address fields — use Location: "${userData.location}".
${commonRules}
${applicantData}`

    case "iCIMS":
      return `You are on an iCIMS job application page. This may be a multi-step form.

STEPS:
1. Do NOT read the job description. Find and click "Apply" or "Apply Now".
2. Look for "Apply as Guest" or "Continue without signing in" if available.
3. Fill required fields: First Name → "${userData.firstName}", Last Name → "${userData.lastName}", Email → "${userData.email}", Phone → "${userData.phone}".
4. ${resumeNote}
5. SKIP optional work experience and education pages — click "Next" / "Skip" if possible.
6. Answer ONLY required screening questions. SKIP optional ones.
7. SKIP EEO/demographic questions — always optional.
8. Click "Submit Application".
9. Wait for confirmation. DONE.

iCIMS QUIRKS:
- Often requires account creation — look for guest/quick apply options first.
- Phone fields often require selecting a phone type dropdown — select "Mobile".
- Location, state, country fields are searchable dropdowns — click to open, type to filter, select.
${commonRules}
${applicantData}`

    case "SmartRecruiters":
      return `You are on a SmartRecruiters job application page.

STEPS:
1. Do NOT read the job description. Click "Apply" or "Apply Now".
2. Fill required fields: First Name → "${userData.firstName}", Last Name → "${userData.lastName}", Email → "${userData.email}", Phone → "${userData.phone}", Location → "${userData.location}".
3. ${resumeNote}
4. Answer ONLY required screening questions.
5. SKIP optional fields and EEO section.
6. Click "Submit" / "Apply".
7. Wait for confirmation. DONE.

SMARTRECRUITERS QUIRKS:
- Location is usually a required autocomplete field — type a few chars, wait, select from suggestions.
- May have multi-step flow with "Next" buttons.
- Consent checkboxes are often required — check them.
${commonRules}
${applicantData}`

    default:
      return `You are on a job application page. The application form is visible on this page. Your task is to fill in EVERY required field, then submit.

STEPS:
1. Do NOT read the job description. IMMEDIATELY scroll to find the form or "Apply" button.
2. Fill required fields using this mapping:
   - "First Name" / "Name" → "${fullName}" (or split: First → "${userData.firstName}", Last → "${userData.lastName}")
   - "Email" → "${userData.email}"
   - "Phone" → "${userData.phone}"
   - "Location" / "City" → "${userData.location}"
   - "LinkedIn" → "${userData.linkedinUrl}"
   - "Current Company" → "${userData.currentCompany || "Freelance"}"
   - "Work Authorization" → "${userData.workAuthorization || "Authorized to work"}"
3. ${resumeNote}
4. For any additional required fields, provide a reasonable answer based on the applicant data.
5. For dropdown fields, click to open and select the closest matching option.
6. After ALL required fields are filled, click "Submit" / "Apply" / "Send Application".
7. If the form has multiple pages, fill only required fields on each page, then click "Next".
8. Wait for confirmation. DONE.
${commonRules}
${applicantData}`
  }
}

// ─── Main entry point ───
export async function fillJobApplicationWithBrowserbase(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string,
  userId?: string
): Promise<AutomationResponse> {
  const startTime = Date.now()

  cachedBrowserbaseApiKey = null
  cachedBrowserbaseProjectId = null
  cachedGeminiApiKey = null
  const { apiKey, projectId, geminiKey } = await getKeys()

  if (!apiKey || !projectId) {
    return { success: false, error: "Browserbase API key or Project ID is not configured. Set them in Settings." }
  }
  if (!geminiKey) {
    return { success: false, error: "Gemini API key is not configured. Set it in Settings." }
  }

  const portal = detectPortal(portalUrl)
  const portalType = portal?.name || "Unknown"
  const targetUrl = portal?.getApplyUrl(portalUrl) || portalUrl

  console.log(`[Browserbase] Starting for: ${userData.name} | Portal: ${portalType} | URL: ${targetUrl}`)
  if (applicationId) await persistLog(applicationId, "info", `Starting for ${userData.name || userData.firstName} | ${portalType} portal | URL: ${targetUrl}`)
  if (onStep) onStep({ status: "session_created", log: `Creating Browserbase session for ${portalType} portal...` })

  const { Stagehand } = await import("@browserbasehq/stagehand")
  const portalConfig = getPortalConfig(portalType)

  let stagehand: InstanceType<typeof Stagehand> | null = null
  let bb: InstanceType<typeof Browserbase> | null = null

  try {
    process.env.BROWSERBASE_API_KEY = apiKey
    process.env.BROWSERBASE_PROJECT_ID = projectId
    process.env.GOOGLE_API_KEY = geminiKey

    bb = new Browserbase({ apiKey })

    // Get or create persistent context for this user
    let contextId: string | null = null
    if (userId) {
      contextId = await getOrCreateBrowserbaseContext(userId, bb)
      if (contextId && applicationId) await persistLog(applicationId, "info", `Using persistent context: ${contextId}`)
    }

    // Build session params with proxies, CAPTCHA auto-solve, keep-alive, and timeout
    const sessionCreateParams: any = {
      browserSettings: {
        solveCaptchas: true,
        ...(contextId ? { context: { id: contextId, persist: true } } : {}),
      },
      proxies: [{ type: "browserbase", geolocation: { country: "US" } }],
      keepAlive: true,
      timeout: portalConfig.timeout,
    }

    stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey,
      projectId,
      model: portalConfig.model as any,
      verbose: 0,
      browserbaseSessionCreateParams: sessionCreateParams,
    })

    await stagehand.init()

    const sessionId = stagehand.browserbaseSessionId
    const sessionUrl = sessionId ? `https://browserbase.com/sessions/${sessionId}` : null

    console.log(`[Browserbase] Session: ${sessionId} | Context: ${contextId || "none"} | Timeout: ${portalConfig.timeout}s | MaxSteps: ${portalConfig.maxSteps}`)
    if (applicationId) {
      await persistLog(applicationId, "info", `Session ${sessionId}. Live/Recording: ${sessionUrl}. Context: ${contextId || "none"}. Timeout: ${portalConfig.timeout}s`)
      if (sessionUrl) {
        await supabase.from("live_application_queue").update({ live_url: sessionUrl }).eq("id", applicationId)
      }
    }
    if (onStep) onStep({ status: "in_progress", log: `Session live: ${sessionUrl}`, liveUrl: sessionUrl })

    const page = stagehand.context.pages()[0]
    const liveUrl = sessionUrl // alias for backward compat in rest of function

    // ─── Listen for CAPTCHA auto-solve events ───
    page.on("console", (msg: any) => {
      const text = msg.text()
      if (text === "browserbase-solving-started") {
        console.log("[Browserbase] CAPTCHA auto-solve started")
        if (onStep) onStep({ status: "in_progress", log: "CAPTCHA detected — Browserbase auto-solving...", liveUrl })
        if (applicationId) persistLog(applicationId, "info", "CAPTCHA detected — auto-solving via Browserbase")
      } else if (text === "browserbase-solving-finished") {
        console.log("[Browserbase] CAPTCHA auto-solve finished")
        if (onStep) onStep({ status: "in_progress", log: "CAPTCHA solved automatically.", liveUrl })
        if (applicationId) persistLog(applicationId, "info", "CAPTCHA auto-solved successfully")
      }
    })

    // ─── Navigate ───
    await page.goto(targetUrl, { waitUntil: "networkidle" } as any)
    if (onStep) onStep({ step: 1, status: "in_progress", log: `Navigated to ${targetUrl}`, liveUrl })
    if (applicationId) await persistLog(applicationId, "info", `Navigated to ${targetUrl}`)

    await page.waitForTimeout(3000)

    // ─── Handle iframes (Greenhouse embeds, etc.) ───
    // Many job portals embed the application form in an iframe.
    // However, direct board URLs (boards.greenhouse.io, jobs.lever.co) render the form
    // directly on the page — no iframe switching needed.
    const isDirectBoardUrl = /boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com/.test(targetUrl)

    if (isDirectBoardUrl) {
      // For direct board URLs, the form is already on the page.
      // On Lever /apply pages, the form is immediately visible — no need to click anything.
      // On Greenhouse #app pages, we may need to scroll to the form section.
      const isLeverApplyPage = /jobs\.lever\.co.*\/apply/.test(targetUrl)
      if (!isLeverApplyPage) {
        try {
          await stagehand.act("click the Apply button, Apply Now button, or Apply for this job button. If no such button exists, do nothing.")
          await page.waitForTimeout(3000)
        } catch {
          // No Apply button — form might already be visible
        }
      }
      // Wait for form fields to render (Greenhouse loads them dynamically)
      try {
        await page.waitForSelector("input[type='text'], input[type='email'], #application-form, #app, form", { timeout: 10000 } as any)
      } catch {
        // Proceed anyway — agent will look for the form
      }
    } else {
      // For company career pages that embed ATS forms in iframes
      try {
        await stagehand.act("click the Apply button, Apply Now button, or Apply for this job button. If no such button exists, do nothing.")
        await page.waitForTimeout(2000)

        // Check if an ATS iframe appeared (common with Greenhouse embeds on company sites)
        const iframeSrc = await page.evaluate(() => {
          const iframes = document.querySelectorAll("iframe")
          for (const iframe of iframes) {
            const src = iframe.getAttribute("src") || ""
            // Only match actual ATS iframes, exclude Google OAuth/analytics/ads iframes
            if (src.includes("googleapis.com") || src.includes("google.com/recaptcha") || src.includes("doubleclick") || src.includes("googletagmanager")) {
              continue
            }
            if (src.includes("greenhouse") || src.includes("lever") || src.includes("ashby") || src.includes("boards.") || src.includes("grnhse")) {
              return src
            }
          }
          return null
        })

        if (iframeSrc) {
          const fullUrl = iframeSrc.startsWith("http") ? iframeSrc : `https:${iframeSrc}`
          await page.goto(fullUrl, { waitUntil: "domcontentloaded" } as any)
          if (onStep) onStep({ step: 2, status: "in_progress", log: `Navigated into iframe: ${fullUrl.substring(0, 60)}...`, liveUrl })
          if (applicationId) await persistLog(applicationId, "info", `Switched to iframe URL: ${fullUrl}`)
          await page.waitForTimeout(1500)
        } else if (targetUrl.includes("gh_jid")) {
          // gh_jid in URL but no iframe found — wait and retry once
          await page.waitForTimeout(3000)
          const retrySrc = await page.evaluate(() => {
            const iframes = document.querySelectorAll("iframe")
            for (const iframe of iframes) {
              const src = iframe.getAttribute("src") || ""
              if (src.includes("googleapis.com") || src.includes("google.com/recaptcha") || src.includes("doubleclick") || src.includes("googletagmanager")) {
                continue
              }
              if (src.includes("greenhouse") || src.includes("lever") || src.includes("boards.") || src.includes("grnhse")) {
                return src
              }
            }
            return null
          })
          if (retrySrc) {
            const fullUrl = retrySrc.startsWith("http") ? retrySrc : `https:${retrySrc}`
            await page.goto(fullUrl, { waitUntil: "domcontentloaded" } as any)
            if (onStep) onStep({ step: 2, status: "in_progress", log: `Found iframe: ${fullUrl.substring(0, 60)}...`, liveUrl })
            if (applicationId) await persistLog(applicationId, "info", `Switched to iframe: ${fullUrl}`)
            await page.waitForTimeout(1500)
          }
        }
      } catch {
        // No Apply button or iframe — form might already be visible
      }
    }

    // ─── Upload resume: use Playwright to set file input directly (before agent runs) ───
    let resumeUploaded = false
    if (userData.resume) {
      try {
        const downloadRes = await axios.get(userData.resume, { responseType: "arraybuffer", timeout: 30000 })
        const resumeBuffer = Buffer.from(downloadRes.data)
        const resumeFileName = userData.resume.split("/").pop() || "resume.pdf"

        // Find the actual input[type=file] element directly via Playwright (not observe)
        // This avoids clicking buttons that open native file dialogs
        const fileInput = page.locator("input[type='file']")
        const fileInputCount = await fileInput.count()
        if (fileInputCount > 0) {
          await fileInput.first().setInputFiles({
            name: resumeFileName,
            mimeType: "application/pdf",
            buffer: resumeBuffer,
          })
          resumeUploaded = true
          if (onStep) onStep({ step: 2, status: "in_progress", log: `Resume uploaded: ${resumeFileName}`, liveUrl })
          if (applicationId) await persistLog(applicationId, "info", `Resume uploaded: ${resumeFileName}`)
        }
      } catch (err) {
        // Resume upload will be attempted by the agent as fallback
        console.log("[Browserbase] Direct resume upload failed, agent will handle it:", err instanceof Error ? err.message : "")
      }
    }

    // ─── Run the agent with a portal-specific instruction ───
    const instruction = buildPortalInstruction(portalType, userData, resumeUploaded)

    if (onStep) onStep({ step: 3, status: "in_progress", log: `Agent filling form (${portalType}, max ${portalConfig.maxSteps} steps)...`, liveUrl })
    if (applicationId) await persistLog(applicationId, "info", `Agent started filling form (${portalType}, max ${portalConfig.maxSteps} steps)`)

    const agent = stagehand.agent({
      cua: false,
      model: portalConfig.model as any,
      systemPrompt: FORM_FILLING_SYSTEM_PROMPT,
    })

    const result = await agent.execute({
      instruction,
      maxSteps: portalConfig.maxSteps,
    }) as any

    const outputStr: string = result.message || ""
    const totalSteps: number = result.actions?.length || 0

    if (onStep) onStep({ step: 4, status: "in_progress", log: `Agent done (${totalSteps} actions): ${outputStr.substring(0, 80)}`, liveUrl })
    if (applicationId) await persistLog(applicationId, "info", `Agent done: ${outputStr.substring(0, 100)}`)

    // ─── Handle CAPTCHA ───
    // Browserbase auto-solves most CAPTCHAs via solveCaptchas:true.
    // If the agent still reports a CAPTCHA, it means auto-solve either hasn't finished
    // or failed. We wait up to 45s for auto-solve, then fall back to human.
    if (applicationId && detectCaptcha(outputStr)) {
      await persistLog(applicationId, "info", `CAPTCHA reported by agent. Waiting for Browserbase auto-solve (up to 45s)...`)
      if (onStep) onStep({ status: "in_progress", log: "CAPTCHA detected — waiting for Browserbase auto-solve...", liveUrl })

      // Wait up to 45s for Browserbase to auto-solve (it emits console events we're already listening to)
      let autoSolved = false
      for (let i = 0; i < 9; i++) {
        await new Promise(r => setTimeout(r, 5000))
        // Check if CAPTCHA is gone by looking for the submit button or absence of CAPTCHA elements
        const captchaStillPresent = await page.evaluate(() => {
          const recaptcha = document.querySelector("iframe[src*='recaptcha']") || document.querySelector(".g-recaptcha")
          const hcaptcha = document.querySelector("iframe[src*='hcaptcha']") || document.querySelector(".h-captcha")
          const turnstile = document.querySelector("iframe[src*='turnstile']") || document.querySelector(".cf-turnstile")
          return !!(recaptcha || hcaptcha || turnstile)
        }).catch(() => true)

        if (!captchaStillPresent) {
          autoSolved = true
          break
        }
      }

      if (autoSolved) {
        // CAPTCHA was auto-solved — continue with the agent
        await persistLog(applicationId, "info", "CAPTCHA auto-solved by Browserbase. Resuming agent...")
        if (onStep) onStep({ status: "in_progress", log: "CAPTCHA auto-solved. Resuming...", liveUrl })

        const continueAgent = stagehand.agent({ cua: false, model: portalConfig.model as any, systemPrompt: FORM_FILLING_SYSTEM_PROMPT })
        const continueResult = await continueAgent.execute({
          instruction: "The CAPTCHA has been solved. Click Submit/Apply to submit the application. If there are remaining empty required fields, fill them first using the applicant data already provided.",
          maxSteps: 15,
        }) as any

        const processingTime = Date.now() - startTime
        const success = !!continueResult.success
        if (applicationId) await persistLog(applicationId, success ? "info" : "error", `After auto-CAPTCHA: ${success ? "success" : "failed"} in ${Math.round(processingTime / 1000)}s`)

        return {
          success,
          result: success ? "Application submitted" : undefined,
          error: success ? undefined : (continueResult.message || "Failed after CAPTCHA"),
          steps: totalSteps + (continueResult.actions?.length || 0),
          recordingUrl: liveUrl,
          taskId: sessionId || undefined,
        }
      }

      // Auto-solve failed — fall back to human intervention
      await supabase.from("live_application_queue").update({ status: "awaiting_captcha", live_url: liveUrl }).eq("id", applicationId)
      await persistLog(applicationId, "info", `CAPTCHA auto-solve failed. Falling back to human. Live: ${liveUrl}`)
      if (onStep) onStep({ status: "awaiting_captcha", log: "CAPTCHA auto-solve failed. Waiting for human operator.", liveUrl })

      while (true) {
        await new Promise(r => setTimeout(r, 10000))
        const { data: queueRow } = await supabase.from("live_application_queue").select("status").eq("id", applicationId).single()
        if (queueRow?.status === "processing") break
      }

      await persistLog(applicationId, "info", "CAPTCHA solved by human. Resuming...")
      if (onStep) onStep({ status: "in_progress", log: "CAPTCHA solved by human. Resuming...", liveUrl })

      const continueAgent = stagehand.agent({ cua: false, model: portalConfig.model as any, systemPrompt: FORM_FILLING_SYSTEM_PROMPT })
      const continueResult = await continueAgent.execute({
        instruction: "The CAPTCHA has been solved. Click Submit/Apply to submit the application. If there are remaining empty required fields, fill them first using the applicant data already provided.",
        maxSteps: 15,
      }) as any

      const processingTime = Date.now() - startTime
      const success = !!continueResult.success
      if (applicationId) await persistLog(applicationId, success ? "info" : "error", `After human CAPTCHA: ${success ? "success" : "failed"} in ${Math.round(processingTime / 1000)}s`)

      return {
        success,
        result: success ? "Application submitted" : undefined,
        error: success ? undefined : (continueResult.message || "Failed after CAPTCHA"),
        steps: totalSteps + (continueResult.actions?.length || 0),
        recordingUrl: liveUrl,
        taskId: sessionId || undefined,
      }
    }

    // ─── Handle OTP ───
    if (applicationId && detectOtp(outputStr)) {
      await supabase.from("live_application_queue").update({ status: "awaiting_otp" }).eq("id", applicationId)
      await persistLog(applicationId, "info", "OTP required. Attempting API-based fetch (webhook + Resend API)...")
      if (onStep) onStep({ status: "awaiting_otp", log: "OTP required. Fetching via API...", liveUrl })

      const proxyEmail = userData.email || ""

      // ── NEW METHOD: API-based OTP fetch (webhook fills DB, or Resend List API) ──
      let otp = await fetchOtpViaApi(applicationId, proxyEmail, 45000)

      // ── FALLBACK: Browser-based OTP fetch from admin panel ──
      if (!otp) {
        await persistLog(applicationId, "info", "API-based OTP fetch failed. Falling back to browser-based method...")
        if (onStep) onStep({ status: "awaiting_otp", log: "API fetch failed. Falling back to browser-based OTP extraction...", liveUrl })

        const otpPage = await stagehand.context.newPage()
        await otpPage.goto("https://admin.nextquark.in/otp-manager", { waitUntil: "domcontentloaded" } as any)

        const otpAgent = stagehand.agent({ cua: false, model: portalConfig.model as any })
        const otpResult = await otpAgent.execute({
          instruction: `Click Refresh. Find the row where "Live App Queue ID" = "${applicationId}". Read the "Extracted OTP" column. Output: OTP_CODE=<the code>. If no matching row found, wait 5 seconds, click Refresh again, and retry up to 3 times.`,
          maxSteps: 12,
          page: otpPage as any,
        }) as any

        const otpMatch = otpResult.message?.match(/OTP_CODE=([A-Za-z0-9]{4,10})/)
        otp = otpMatch?.[1] || null
        await otpPage.close()
      }

      if (otp) {
        await persistLog(applicationId, "info", `OTP obtained: ${otp}`)
        if (onStep) onStep({ status: "in_progress", log: `OTP: ${otp}. Entering on application page...`, liveUrl })
        await supabase.from("live_application_queue").update({ status: "processing" }).eq("id", applicationId)

        const otpEntryAgent = stagehand.agent({ cua: false, model: portalConfig.model as any })
        const otpEntryResult = await otpEntryAgent.execute({
          instruction: `Enter "${otp}" in the verification/OTP field. Click Verify/Submit. If the form continues, fill remaining required fields and submit.`,
          maxSteps: 15,
        }) as any

        const processingTime = Date.now() - startTime
        const success = !!otpEntryResult.success
        if (applicationId) await persistLog(applicationId, success ? "info" : "error", `After OTP: ${success ? "success" : "failed"} in ${Math.round(processingTime / 1000)}s`)

        // Clear the OTP from DB
        await supabase.from("live_application_queue").update({ verification_otp: null }).eq("id", applicationId)

        return {
          success,
          result: success ? "Application submitted" : undefined,
          error: success ? undefined : (otpEntryResult.message || "Failed after OTP"),
          steps: totalSteps + (otpEntryResult.actions?.length || 0),
          recordingUrl: liveUrl,
          taskId: sessionId || undefined,
        }
      } else {
        await persistLog(applicationId, "error", "Could not extract OTP via API or browser fallback.")
        if (onStep) onStep({ status: "error", log: "OTP extraction failed via both methods.", liveUrl })
        return { success: false, error: "OTP extraction failed via both API and browser methods.", steps: totalSteps, recordingUrl: liveUrl }
      }
    }

    // ─── Normal completion ───
    const processingTime = Date.now() - startTime
    const success = !!result.success

    if (applicationId) {
      await persistLog(applicationId, success ? "info" : "error", `${success ? "Completed" : "Failed"} in ${Math.round(processingTime / 1000)}s, ${totalSteps} actions`)
    }

    return {
      success,
      result: success ? (outputStr || "Application submitted") : undefined,
      error: success ? undefined : (outputStr || "Form submission failed"),
      steps: totalSteps,
      recordingUrl: liveUrl,
      taskId: sessionId || undefined,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error"
    console.error("[Browserbase] Error:", error)
    if (applicationId) await persistLog(applicationId, "error", `Error: ${errorMsg}`)
    if (onStep) onStep({ status: "error", error: errorMsg })
    return { success: false, error: errorMsg }
  } finally {
    if (stagehand) {
      try {
        // Release keep-alive session properly, then close
        if (bb && stagehand.browserbaseSessionId) {
          await bb.sessions.update(stagehand.browserbaseSessionId, { status: "REQUEST_RELEASE" } as any)
        }
        await stagehand.close()
      } catch {}
    }
  }
}

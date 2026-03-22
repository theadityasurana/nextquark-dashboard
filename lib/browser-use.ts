import { createClient } from "@supabase/supabase-js"
import axios from "axios"
import { detectPortal } from "./portal-detector"

export interface AutomationResponse {
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

async function createSession(profileId?: string, config?: PortalTaskConfig): Promise<{ id: string; liveUrl: string | null }> {
  const cfg = config || DEFAULT_TASK_CONFIG
  const body: any = {
    proxyCountryCode: "us",
    browserScreenWidth: cfg.screenWidth,
    browserScreenHeight: cfg.screenHeight,
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

  const resumeUploadFallback = `
- ⚠️ FILE UPLOAD FALLBACK — SHADOW DOM HANDLING: If uploading the resume fails with an error like "Node is not a file input element" or the upload button does not respond, the website is using a custom/shadow DOM file input. Try these fallback strategies IN ORDER until one works:
  (1) Look for a HIDDEN <input type="file"> element near the upload button — it may be invisible or have opacity:0. Try clicking it directly or use JavaScript: document.querySelector('input[type=file]').click()
  (2) Look for a drag-and-drop zone (a dashed-border area or text saying "Drag and drop" / "Drop file here"). If present, try dragging the file onto it.
  (3) Try clicking the visible upload button/area and then immediately check if a native file dialog opened. If it did, select the uploaded file from the session files.
  (4) If the upload area has text like "paste" or supports paste, try pasting the file.
  (5) If ALL upload attempts fail after 3 tries, SKIP the resume upload and CONTINUE filling the rest of the form. Do NOT terminate the task just because the resume upload failed — submit the application without the resume rather than giving up entirely. The resume is important but a submitted application without a resume is better than no application at all.`

  const resumeInstruction = uploadedFileName
    ? `- RESUME UPLOAD: A resume file "${uploadedFileName}" has been uploaded to this browser session. Whenever you see ANY file upload field for resume/CV, ALWAYS upload this file. Look for buttons labeled "Upload", "Attach", "Attach Resume", "Choose File", "Browse", "Add File", or any file input field. Click the button to open the file picker and select the uploaded file.
${resumeUploadFallback}
- COVER LETTER: Do NOT upload or attach a cover letter. If the form has SEPARATE upload fields for both resume AND cover letter, upload the resume ONLY and leave the cover letter field empty. If the form has a SINGLE upload field that says "Resume or Cover Letter" or "Resume/Cover Letter", upload the resume file into that field.`
    : `- RESUME UPLOAD: If a resume/CV upload field is present, download the file from the resume_url provided in the applicant data and upload it.
${resumeUploadFallback}
- COVER LETTER: Do NOT upload or attach a cover letter. If the form has SEPARATE upload fields for both resume AND cover letter, upload the resume ONLY and leave the cover letter field empty. If the form has a SINGLE upload field that says "Resume or Cover Letter" or "Resume/Cover Letter", upload the resume file into that field.`

  const fieldMapping = `
FIELD-TO-VALUE MAPPING — When you see a form field, use the EXACT value from this mapping:
- "First Name" / "First name" / "Given Name" → ${userData.firstName || ""}
- "Last Name" / "Last name" / "Surname" / "Family Name" → ${userData.lastName || ""}
- "Full Name" / "Name" → ${userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim()}
- "Email" / "Email Address" / "E-mail" → ${userData.email || ""}
- "Phone" / "Phone Number" / "Mobile" / "Contact Number" / "Telephone" → ${userData.phone || ""}
- "Location" / "City" / "Current Location" / "Where are you based" → ${userData.location || ""}
- "LinkedIn" / "LinkedIn URL" / "LinkedIn Profile" → ${userData.linkedinUrl || ""}
- "GitHub" / "GitHub URL" / "Portfolio" → ${userData.githubUrl || ""}
- "Work Authorization" / "Are you authorized to work" / "Visa Sponsorship" / "Do you require sponsorship" → ${userData.workAuthorization || ""}
- "Gender" → ${userData.gender || ""}
- "Race" / "Ethnicity" → ${userData.ethnicity || ""}
- "Veteran Status" → ${userData.veteranStatus || ""}
- "Disability" / "Disability Status" → ${userData.disabilityStatus || ""}
- "Salary" / "Expected Salary" / "Compensation" → ${userData.salaryMin && userData.salaryMax ? `${userData.salaryCurrency || "USD"} ${userData.salaryMin} - ${userData.salaryMax}` : ""}
- "How did you hear about us" / "Source" / "Referral" → "Job Board"
- "Start Date" / "When can you start" / "Availability" → "Immediately"
- Any acknowledgement / agreement / certification checkbox → Check it / select "Yes" / "I agree"`

  const commonRules = `
${fieldMapping}

IMPORTANT RULES:
- ⚠️ SKIP JOB DESCRIPTION — DO NOT READ IT: When the page loads, it will likely show the job title, description, responsibilities, requirements, qualifications, benefits, company info, and other non-form content at the TOP of the page. DO NOT read, analyze, scroll through, or spend ANY time on this content. It is completely irrelevant to your task. Your ONLY job is to fill out the application form. IMMEDIATELY scroll to the BOTTOM of the page or look for the application form section. Use keyboard shortcut End key or Cmd+End or scroll aggressively to the bottom. Look for form fields (input boxes, dropdowns, file upload buttons) or an "Apply" / "Apply for this job" button. If the form is on the same page, scroll past ALL descriptive text until you reach the first form field. If there is an "Apply" button that opens the form, click it immediately without reading anything above it.
- ⚠️ ONE FIELD AT A TIME — SEQUENTIAL FILLING: You MUST fill the form ONE FIELD AT A TIME, in order from top to bottom. For EACH field, follow this exact cycle: (1) Focus on the SINGLE next empty required field. (2) If it is a text input, click it and type the value. If it is a dropdown, click to open it, wait for options to appear, then select the correct option. (3) VERIFY the field now shows the correct value before moving on. If a dropdown closed without selecting anything, re-open it and try again. (4) Only AFTER confirming the field is correctly filled, move to the NEXT field. Do NOT plan or batch multiple fields at once. Do NOT open a second dropdown while a first one is still open. Do NOT click on the next field until the current field is confirmed filled. Treat each field as a completely independent task — finish it fully, verify it, then proceed.  This is the MOST IMPORTANT behavioral rule. Violating it causes dropdowns to collide, selections to be lost, and fields to end up empty.
- ONLY fill fields that are MANDATORY / REQUIRED (marked with *, "required", or that block form submission). SKIP ALL optional fields entirely — do NOT fill them, do NOT click on them, do NOT interact with them at all. If a field is not marked as required, LEAVE IT BLANK and move on. This is critical — filling optional fields wastes time and can cause errors.
- When you encounter a REQUIRED field, MATCH it to the FIELD-TO-VALUE MAPPING above and enter the corresponding value. Do NOT leave required fields empty if a value is available in the mapping.
- ⚠️ NEVER TYPE INTO DROPDOWN FIELDS: Before entering ANY value into a form field, FIRST check if the field is a dropdown, select, or has a clickable arrow/chevron icon next to it. If it IS a dropdown or select field, you MUST click the dropdown arrow or the field itself to OPEN the options list FIRST, then select from the visible options. NEVER type text directly into a dropdown field — typing into dropdowns causes errors, selects wrong values, or gets ignored entirely. This applies to ALL fields that look like they might be dropdowns: country selectors, phone country codes, location fields, "How did you hear" fields, state/province selectors, degree selectors, gender fields, work authorization fields, and any field with a downward arrow icon. When in doubt whether a field is a text input or a dropdown, try clicking the arrow/chevron first — if a list appears, it is a dropdown.
- ⚠️ DROPDOWN VALUE MATCHING — ALWAYS READ OPTIONS FIRST: For ALL dropdown/select fields, you MUST follow this process: (1) OPEN the dropdown by clicking it. (2) READ the actual options that appear in the dropdown list. (3) Pick the CLOSEST matching option from what is ACTUALLY AVAILABLE in the list. Do NOT assume the dropdown will contain an option that exactly matches the applicant data. The dropdown options may use completely different wording, abbreviations, or even inverted phrasing. For example: if the applicant data says "Yes, I will require visa sponsorship" but the dropdown options are ["Yes", "No"], select "Yes". If the question is inverted like "Are you authorized to work without sponsorship?" and the applicant needs sponsorship, select "No" (because the question is inverted). ALWAYS read the question text AND the available options carefully, then pick the option whose MEANING best matches the applicant's situation — not the option whose TEXT best matches the applicant data string. The dropdown's actual options are the ONLY source of truth for what you can select. so donot start typing over here if the drop down has its own options, select the best option rather than typing your own things.
- DROPDOWN/SEARCHABLE SELECT HANDLING: Most dropdowns have a search bar inside them. Follow this EXACT sequence every time: (1) Click the dropdown arrow or the field to OPEN the dropdown list. (2) Once the dropdown is open, look for a search/filter input INSIDE the dropdown panel. (3) Click on that search input and type a few characters to filter the options. (4) Wait for filtered results to appear, then click the correct option from the visible list. NEVER type directly into the main field before opening the dropdown — this will fail on most searchable selects. This applies to ALL dropdowns: location fields, country selectors, phone country codes, "How did you hear" fields, state/province selectors, degree selectors, and any other combo-box/searchable-select elements.
- ⚠️ PHONE COUNTRY CODE DROPDOWN: The phone number field almost always has a SEPARATE country code dropdown next to it (showing a flag or "+1" or "US"). This is a DROPDOWN — do NOT type "India" or "+91" or any text into it. Instead: (1) CLICK the country code dropdown/flag icon to OPEN the list. (2) Once the dropdown list is open, if there is a search box inside it, type "India" to filter. (3) Look for the option that shows "India (+91)" or "🇮🇳 +91" or "India" with "+91". (4) Click on that option row to select it. The country code should now show +91. Only THEN type the phone number digits into the phone number input field. NEVER type "+91" or "India" directly into the phone number text field.
- ⚠️ CRITICAL DROPDOWN CLICK-TARGET RULE: When selecting an option from ANY dropdown, scrollable list, or autocomplete suggestion panel, you MUST click on the ENTIRE OPTION ROW/CONTAINER element (the <li>, <div>, or <option> box), NOT on the text label inside it. Dropdown options often have long text that extends beyond the visible area, or the text element is smaller than the clickable row. If you click only on the text/label, the click may land outside the option's hit area and fail. ALWAYS target the outermost clickable container of the option row. If the option row has padding or whitespace around the text, click in the CENTER of the full row area, not on the edge of the text. This is especially important for: (a) dropdowns with long option labels that overflow or wrap to multiple lines, (b) scrollable dropdown lists where options may be partially visible, (c) custom-styled select menus where the clickable area is the wrapper div, not the inner span/text. If a click on a dropdown option does not register (the dropdown stays open and no option is selected), try clicking more toward the CENTER of the option's bounding box rather than on the text.
- AUTOCOMPLETE / TYPEAHEAD FIELDS: Some text fields are NOT free-text — when you start typing, a list of suggestions/options will appear below the field. If suggestions/options appear, you MUST select one of the suggested options by clicking on it. Do NOT just type your full answer and press Enter or move on. Do NOT ignore the dropdown suggestions and force your own typed value. Always wait for the suggestion list to appear, then click the CENTER of the closest matching option row (not just the text label). If none of the suggestions match exactly, pick the closest one. This is common for location/city fields, company name fields, university/school fields, job title fields, and skill fields.
- For required acknowledgement/agreement/certification checkboxes, CHECK THEM (select "I agree" / "I acknowledge" / "I confirm").
${resumeInstruction}
- Do NOT click "Save for later" or "Save draft". Only click "Submit" / "Apply" / "Send Application".
- If a popup, modal, or cookie banner appears, DISMISS it immediately and continue.
- TERMINATE IMMEDIATELY if you see a "successfully applied" or "application received" confirmation.
- TERMINATE if you encounter a login wall that cannot be bypassed.
- SKIP EEO/demographic questions (gender, race, veteran status, disability) unless they are explicitly required and block submission.
- ⚠️ DO NOT CLEAR ALREADY-FILLED FIELDS: If you need to go back to fill a field you missed, or if form validation highlights a missing field, ONLY fill the EMPTY/MISSING fields. Do NOT click on, clear, re-type, or modify any field that already has a value in it. Leave all previously filled fields exactly as they are. If you accidentally click on a filled field, press Escape or click away WITHOUT changing its value. This is critical — re-interacting with filled fields can erase their values and cause cascading errors. When fixing a validation error, scroll directly to the empty/errored field, fill ONLY that field, and then submit again.
- ⚠️ CAPTCHA HANDLING: If you encounter a CAPTCHA (reCAPTCHA, hCaptcha, Cloudflare Turnstile, or any other visual challenge / puzzle / image selection / "I am not a robot" checkbox), STOP IMMEDIATELY. Do NOT try to solve it. Do NOT click the checkbox. Do NOT attempt the image challenge. Do NOT wait for it to auto-resolve. TERMINATE the task RIGHT AWAY and include the exact phrase "CAPTCHA_VERIFICATION_REQUIRED" in your final output/reason. A human operator will come and solve the CAPTCHA manually while the browser session is still alive.
- ⚠️ HIGHEST PRIORITY — OTP/VERIFICATION DETECTION: At ANY point during the entire process — whether you are filling the form, clicking next, submitting, or on any page — if you see ANYTHING on screen related to OTP, verification code, "Enter the code sent to your email", "Verify your email", "Enter verification code", "Check your inbox", "We sent you a code", or any similar prompt asking for a code/verification, you MUST STOP IMMEDIATELY. Do NOT check whether other fields on the page are filled or empty. Do NOT scroll. Do NOT try to fill any remaining fields. Do NOT try to guess or enter any code. Just TERMINATE the task RIGHT THEN AND THERE and include the exact phrase "OTP_VERIFICATION_REQUIRED" in your final output/reason. This rule overrides ALL other instructions. The OTP will be fetched automatically in a follow-up task after a 2-minute wait.`

  switch (portalName) {
    case "Greenhouse":
      return `You are on a Greenhouse job application page. This is a SINGLE-PAGE form.

STEPS:
1. IMMEDIATELY scroll to the bottom of the page to find the "Apply for this job" section. Do NOT read the job description, requirements, or any other text above the form. Use End key or scroll aggressively — skip everything until you see form input fields.
2. Fill in the required fields using the FIELD-TO-VALUE MAPPING: First Name → "${userData.firstName}", Last Name → "${userData.lastName}", Email → "${userData.email}", Phone → "${userData.phone}".
3. Upload resume using the uploaded file. SKIP the cover letter upload field.
4. Answer ONLY custom questions that are marked as required (have * or "required" label). SKIP all optional questions.
5. SKIP: LinkedIn URL, Website, Cover Letter, "How did you hear" — unless explicitly marked required.
6. SKIP: EEO/demographic section (gender, race, veteran, disability) — these are always optional on Greenhouse.
7. Scroll to the bottom and click "Submit Application".
8. Wait for confirmation. DONE.

KNOWN QUIRKS:
- Greenhouse forms are single-page. Do NOT look for a "Next" button.
- Location fields use an autocomplete dropdown — click the field first, type a few characters of the city, wait for suggestions to appear, then click the matching suggestion. Do NOT just type and move on.
- Country/phone code selectors are dropdowns — click to open, then select from the list.
- If submission fails due to a missing required field, fill ONLY that field and resubmit.
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
  "captcha_verification_required", "captcha", "recaptcha", "hcaptcha",
  "cloudflare turnstile", "i am not a robot", "verify you are human",
  "human verification", "security challenge",
]

function detectOtpRequired(output: string | null): boolean {
  if (!output) return false
  const text = output.toLowerCase()
  return OTP_DETECTION_KEYWORDS.some(kw => text.includes(kw))
}

function detectCaptchaRequired(output: string | null): boolean {
  if (!output) return false
  const text = output.toLowerCase()
  return CAPTCHA_DETECTION_KEYWORDS.some(kw => text.includes(kw))
}

// Broader CAPTCHA detection: checks output + all step data (goals, URLs, descriptions)
function detectCaptchaFromResult(result: BUTaskResult): boolean {
  // Check final output
  const outputText = typeof result.output === "string" ? result.output : JSON.stringify(result.output || "")
  if (detectCaptchaRequired(outputText)) return true

  // Check all step data for CAPTCHA mentions
  if (result.steps?.length) {
    for (const step of result.steps) {
      const stepText = [
        step.nextGoal,
        step.output,
        step.description,
        step.url,
        step.error,
        step.reason,
        typeof step === "string" ? step : JSON.stringify(step),
      ].filter(Boolean).join(" ")
      if (detectCaptchaRequired(stepText)) return true
    }
  }

  return false
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
  if (onStep) onStep({ status: "session_created", log: `Creating Browser Use session for ${portalType} portal (optimized: vision=${portalConfig.useVision})...` })

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

    const session = await createSession(profileId, portalConfig)
    sessionId = session.id
    console.log(`[Browser Use] Session created: ${sessionId}${profileId ? ` with profile ${profileId}` : ""} (${portalConfig.screenWidth}x${portalConfig.screenHeight})`)
    if (applicationId) await persistLog(applicationId, "info", `Session ${sessionId} created.`)

    // Upload resume to the session if available
    let uploadedFileName: string | null = null
    if (userData.resume) {
      if (onStep) onStep({ status: "in_progress", log: "Uploading resume to browser session..." })
      uploadedFileName = await uploadResumeToSession(sessionId, userData.resume, applicationId)
    }

    const prompt = buildPortalPrompt(portalType, userData, uploadedFileName)

    // Create main application task in the session with portal-optimized config
    const createRes = await buRequest("POST", "/tasks", {
      task: prompt,
      start_url: targetUrl,
      session_id: sessionId,
      vision: portalConfig.useVision,
      highlightElements: true,
      flashMode: !portalConfig.useVision, // flash mode only when vision is off (cheaper)
    })

    const taskId = createRes.id
    if (applicationId) await persistLog(applicationId, "info", `Task ${taskId} created in session ${sessionId}. Polling...`)
    if (onStep) onStep({ step: 0, status: "in_progress", log: `Task ${taskId} created. Polling...`, taskId })

    // Poll until terminal (with portal-tuned intervals)
    let result = await pollTaskUntilComplete(taskId, onStep, applicationId, portalConfig)
    let totalSteps = result.steps.length
    let liveUrl = result.live_url || session.liveUrl || null

    // ─── CAPTCHA Pause (same session, human solves it) ───
    if (applicationId && detectCaptchaFromResult(result)) {
      console.log("[Browser Use] CAPTCHA detected. Pausing for human intervention...")

      await supabase
        .from("live_application_queue")
        .update({ status: "awaiting_captcha", live_url: liveUrl })
        .eq("id", applicationId)

      await persistLog(applicationId, "info", `CAPTCHA detected. Session kept alive. Live URL: ${liveUrl || 'N/A'}. Waiting for human to solve it...`)
      if (onStep) onStep({
        status: "awaiting_captcha",
        log: "CAPTCHA detected. The browser session is still live — a human operator can connect and solve the CAPTCHA.",
        liveUrl,
      })

      // Poll indefinitely for status change — human will update status back to "processing" after solving
      const captchaPollInterval = 10_000 // check every 10s

      while (true) {
        await new Promise(r => setTimeout(r, captchaPollInterval))

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

      // After human solves CAPTCHA, create a new task in the same session to continue
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
        session_id: sessionId,
        vision: portalConfig.useVision,
      })

      const continueResult = await pollTaskUntilComplete(continueRes.id, onStep, applicationId, portalConfig)
      result = continueResult
      totalSteps += continueResult.steps.length
      liveUrl = continueResult.live_url || liveUrl
    }

    // ─── OTP Pause & Resume (same session, fetch from OTP Manager tab) ───
    const outputTextForOtp = typeof result.output === "string" ? result.output : JSON.stringify(result.output || "")
    if (applicationId && detectOtpRequired(outputTextForOtp)) {
      console.log("[Browser Use] OTP detected. Session still alive. Fetching from OTP Manager tab...")

      await supabase
        .from("live_application_queue")
        .update({ status: "awaiting_otp" })
        .eq("id", applicationId)

      await persistLog(applicationId, "info", "OTP required. Waiting 10s for email to arrive before fetching...")
      if (onStep) onStep({ status: "awaiting_otp", log: "OTP verification required. Waiting 10 seconds for the email to arrive..." })

      await new Promise(r => setTimeout(r, 10_000))

      const proxyEmail = userData.email || ""

      // Step 1: Open OTP Manager tab, then fetch the OTP from it
      if (onStep) onStep({ status: "awaiting_otp", log: "Opening OTP Manager tab to fetch verification code..." })
      const openAndFetchPrompt = `STEP A: Open a new browser tab and navigate to ${OTP_MANAGER_URL}.
STEP B: Once the page loads, follow these instructions:
${buildOtpFetchPrompt(applicationId, proxyEmail)}`
      const otpFetchRes = await buRequest("POST", "/tasks", {
        task: openAndFetchPrompt,
        session_id: sessionId,
        vision: true, // OTP page needs vision to read the table
      })

      const otpFetchResult = await pollTaskUntilComplete(otpFetchRes.id, onStep, applicationId)
      totalSteps += otpFetchResult.steps.length

      // Extract OTP from the agent's output
      const otpOutput = typeof otpFetchResult.output === "string" ? otpFetchResult.output : JSON.stringify(otpFetchResult.output || "")
      const otpMatch = otpOutput.match(/OTP_CODE=([A-Za-z0-9]{4,10})/)
      const otp = otpMatch?.[1] || null

      if (otp) {
        await persistLog(applicationId, "info", `OTP extracted from admin panel: ${otp}`)
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
          session_id: sessionId,
          vision: true,
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
        await persistLog(applicationId, "error", "Could not extract OTP from admin panel.")
        if (onStep) onStep({ status: "error", log: "Failed to extract OTP from admin panel. Application failed." })
        return {
          success: false,
          error: "OTP extraction failed. Could not find matching OTP in admin panel.",
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

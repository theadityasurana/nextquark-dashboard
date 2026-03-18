import { createClient } from "@supabase/supabase-js"
import axios from "axios"
import FormData from "form-data"
import type { StreamCallback, SkyvernResponse } from "./skyvern"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Logging (same format as skyvern.ts) ───

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

async function logAndStream(
  applicationId: string | undefined,
  onStep: StreamCallback | undefined,
  level: string,
  message: string,
  stepData?: Record<string, any>
) {
  if (applicationId) await persistLog(applicationId, level, message)
  if (onStep) onStep({ status: level === "error" ? "error" : "in_progress", log: message, ...stepData })
}

// ─── Extended SkyvernResponse with unmapped field context ───

export interface DirectApplyResponse extends SkyvernResponse {
  unmappedFields?: string[]
  totalFields?: number
  mappedFields?: number
}

// ─── URL Parsers ───

interface GreenhouseIds {
  boardToken: string
  jobId: string
}

function parseGreenhouseUrl(url: string): GreenhouseIds | null {
  // Format: https://boards.greenhouse.io/{board}/jobs/{id}
  let match = url.match(/boards\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/)
  if (match) return { boardToken: match[1], jobId: match[2] }

  // Format: https://job-boards.greenhouse.io/{board}/jobs/{id}
  match = url.match(/job-boards\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/)
  if (match) return { boardToken: match[1], jobId: match[2] }

  // Format: URL with gh_jid query param (e.g. /cloudflare/jobs/6429738?gh_jid=6429738)
  try {
    const urlObj = new URL(url)
    const ghJid = urlObj.searchParams.get("gh_jid")
    if (ghJid) {
      const boardMatch = url.match(/greenhouse\.io\/([^/?#]+)/)
      if (boardMatch) return { boardToken: boardMatch[1], jobId: ghJid }
    }
  } catch {}

  // Generic fallback: any greenhouse.io URL with /jobs/{id}
  match = url.match(/greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/)
  if (match) return { boardToken: match[1], jobId: match[2] }

  return null
}

interface LeverIds {
  company: string
  postingId: string
}

function parseLeverUrl(url: string): LeverIds | null {
  const match = url.match(/lever\.co\/([^/?#]+)\/([a-f0-9-]+)/)
  return match ? { company: match[1], postingId: match[2] } : null
}

interface AshbyIds {
  orgSlug: string
  jobId: string
}

function parseAshbyUrl(url: string): AshbyIds | null {
  const match = url.match(/ashbyhq\.com\/([^/?#]+)\/([a-f0-9-]+)/)
  return match ? { orgSlug: match[1], jobId: match[2] } : null
}

// ─── Resume Downloader ───

async function downloadResume(resumeUrl: string): Promise<{ buffer: Buffer; filename: string } | null> {
  if (!resumeUrl) return null
  try {
    const response = await axios.get(resumeUrl, { responseType: "arraybuffer", timeout: 30000 })
    const filename = resumeUrl.split("/").pop()?.split("?")[0] || "resume.pdf"
    return { buffer: Buffer.from(response.data), filename }
  } catch (err) {
    console.error("Failed to download resume:", err)
    return null
  }
}

// ─── Improved Question Matcher ───

function matchGreenhouseQuestion(question: any, userData: any): string | number | null {
  const label = (question.label || "").toLowerCase()
  const desc = (question.description || "").toLowerCase()
  const text = label + " " + desc

  // Gender
  if (/\bgender\b|\bsex\b/.test(text)) {
    return userData.gender || null
  }

  // Race / Ethnicity
  if (/\brace\b|\bethnicity\b|\bethnic\b/.test(text)) {
    return userData.ethnicity || null
  }

  // Veteran
  if (/\bveteran\b|\bmilitary\b|\bservice member\b/.test(text)) {
    return userData.veteranStatus || null
  }

  // Disability
  if (/\bdisabilit(y|ies)\b|\bhandicap\b|\bimpairment\b/.test(text)) {
    return userData.disabilityStatus || null
  }

  // Work authorization / Visa / Sponsorship
  if (/\bauthoriz(ed|ation)\b|\bsponsorship\b|\bvisa\b|\blegally\b|\bwork permit\b|\beligib(le|ility) to work\b|\bright to work\b|\brequire sponsorship\b/.test(text)) {
    return userData.workAuthorization || null
  }

  // Salary / Compensation
  if (/\bsalary\b|\bcompensation\b|\bpay\b|\bwage\b|\bexpected.*(?:salary|pay|compensation)\b|\bdesired.*(?:salary|pay|compensation)\b/.test(text)) {
    if (userData.salaryMin || userData.salaryMax) {
      return `${userData.salaryCurrency || "USD"} ${userData.salaryMin || 0} - ${userData.salaryMax || 0}`
    }
    return null
  }

  // LinkedIn
  if (/\blinkedin\b/.test(text)) {
    return userData.linkedinUrl || null
  }

  // GitHub / Portfolio / Website
  if (/\bgithub\b|\bportfolio\b/.test(text)) {
    return userData.githubUrl || null
  }
  if (/\bwebsite\b|\bpersonal.*url\b|\bpersonal.*link\b/.test(text)) {
    return userData.linkedinUrl || userData.githubUrl || null
  }

  // How did you hear / Source / Referral
  if (/\bhear about\b|\bhow did you\b|\bsource\b|\breferr(al|ed)\b|\bwhere did you\b|\bfind (this|us|the)\b/.test(text)) {
    return "Job Board"
  }

  // Cover letter / Additional info
  if (/\bcover letter\b|\badditional information\b|\banything else\b|\btell us more\b|\bwhy.*interested\b|\bwhy.*apply\b|\bmotivation\b/.test(text)) {
    return userData.coverLetter || null
  }

  // Experience / Years
  if (/\byears? of.*experience\b|\bexperience.*years?\b|\bhow many years\b|\bhow long.*work\b/.test(text)) {
    return userData.experience || null
  }

  // Education / Degree
  if (/\beducation\b|\bdegree\b|\buniversity\b|\bcollege\b|\bschool\b|\bhighest.*qualification\b/.test(text)) {
    return userData.education || null
  }

  // Location / City / Where
  if (/\blocation\b|\bcity\b|\bwhere are you\b|\bcurrent.*location\b|\bbased in\b|\bwhere.*located\b/.test(text)) {
    return userData.location || null
  }

  // Phone
  if (/\bphone\b|\bmobile\b|\bcontact number\b|\bcell\b|\btelephone\b/.test(text)) {
    return userData.phone || null
  }

  // Start date / Availability
  if (/\bstart date\b|\bwhen.*start\b|\bavailab(le|ility)\b|\bearliest.*start\b|\bnotice period\b/.test(text)) {
    return "Immediately" // reasonable default
  }

  // Acknowledgement / Certification / Agreement checkboxes
  if (/\backnowledge\b|\bcertif(y|ication)\b|\bagree(ment)?\b|\bconfirm\b|\bhereby\b|\battest\b/.test(text)) {
    return "Yes"
  }

  return null
}

function matchSelectOption(question: any, answerText: string | null): number | string | null {
  if (!answerText || !question.values?.length) return null
  const lower = answerText.toLowerCase().trim()

  // Exact match first
  for (const opt of question.values) {
    const optLabel = (opt.label || "").toLowerCase().trim()
    if (optLabel === lower) return opt.value ?? opt.id
  }

  // Contains match
  for (const opt of question.values) {
    const optLabel = (opt.label || "").toLowerCase()
    if (optLabel.includes(lower) || lower.includes(optLabel)) {
      return opt.value ?? opt.id
    }
  }

  // Partial word match (words > 3 chars)
  for (const opt of question.values) {
    const optLabel = (opt.label || "").toLowerCase()
    const words = lower.split(/\s+/).filter((w: string) => w.length > 3)
    if (words.some((w: string) => optLabel.includes(w))) {
      return opt.value ?? opt.id
    }
  }

  // For boolean-like questions, try yes/no mapping
  if (question.values.length <= 3) {
    if (/\byes\b|\btrue\b|\bi do\b|\bi am\b|\bi have\b/.test(lower)) {
      const yesOpt = question.values.find((o: any) => /\byes\b/i.test(o.label))
      if (yesOpt) return yesOpt.value ?? yesOpt.id
    }
    if (/\bno\b|\bfalse\b|\bi do not\b|\bi don't\b/.test(lower)) {
      const noOpt = question.values.find((o: any) => /\bno\b/i.test(o.label))
      if (noOpt) return noOpt.value ?? noOpt.id
    }
  }

  return null
}

// ─── Smart Error Parser ───

function parseApiError(status: number, body: any): { missingFields: string[]; message: string } {
  const missingFields: string[] = []
  let message = `HTTP ${status}`

  if (typeof body === "string") {
    try { body = JSON.parse(body) } catch {}
  }

  if (body?.errors) {
    // Greenhouse error format: { errors: [{ field: "email", message: "is required" }] }
    if (Array.isArray(body.errors)) {
      for (const err of body.errors) {
        if (err.field) missingFields.push(err.field)
        if (err.message) message += ` | ${err.field || "unknown"}: ${err.message}`
      }
    }
  }

  if (body?.error) {
    message = typeof body.error === "string" ? body.error : JSON.stringify(body.error)
  }

  if (body?.message) {
    message = body.message
  }

  // Lever error format
  if (body?.msg) {
    message = body.msg
    if (body.msg.includes("required")) {
      const fieldMatch = body.msg.match(/(\w+)\s+is required/gi)
      if (fieldMatch) missingFields.push(...fieldMatch.map((m: string) => m.replace(/ is required/i, "")))
    }
  }

  return { missingFields, message }
}

// ─── Greenhouse Direct Apply ───

async function applyGreenhouse(
  url: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<DirectApplyResponse> {
  const startTime = Date.now()
  const ids = parseGreenhouseUrl(url)
  if (!ids) throw new Error(`Could not parse Greenhouse URL: ${url}`)

  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Greenhouse detected | Board: ${ids.boardToken} | Job: ${ids.jobId}`, { step: 1 })

  // Fetch job details and questions
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Fetching job questions from Greenhouse API...`, { step: 2 })

  let jobData: any = null
  let questions: any[] = []
  try {
    const jobRes = await axios.get(
      `https://boards-api.greenhouse.io/v1/boards/${ids.boardToken}/jobs/${ids.jobId}`,
      { params: { questions: true }, timeout: 15000 }
    )
    jobData = jobRes.data
    questions = jobData.questions || []
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] Found ${questions.length} questions for "${jobData.title || "Unknown"}"`, { step: 3 })
  } catch (err: any) {
    if (err.response?.status === 404) {
      throw new Error(`Greenhouse job not found (404). Board: ${ids.boardToken}, Job: ${ids.jobId}. The job may have been removed.`)
    }
    throw new Error(`Failed to fetch Greenhouse job: ${err.message}`)
  }

  // Download resume
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Downloading resume...`, { step: 4 })
  const resume = await downloadResume(userData.resume)
  if (resume) {
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] Resume downloaded: ${resume.filename} (${Math.round(resume.buffer.length / 1024)}KB)`, { step: 5 })
  } else {
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] No resume available, continuing without it`, { step: 5 })
  }

  // Build form data
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Mapping user data to application fields...`, { step: 6 })

  const form = new FormData()
  form.append("first_name", userData.firstName || "")
  form.append("last_name", userData.lastName || "")
  form.append("email", userData.email || "")
  form.append("phone", userData.phone || "")
  form.append("location", userData.location || "")

  if (resume) {
    form.append("resume", resume.buffer, { filename: resume.filename, contentType: "application/pdf" })
  }

  if (userData.coverLetter) {
    form.append("cover_letter", userData.coverLetter)
  }

  // Map custom questions
  let mappedCount = 0
  let skippedCount = 0
  const unmappedFields: string[] = []
  const standardFields = ["first_name", "last_name", "email", "phone", "resume", "cover_letter", "location"]

  for (const q of questions) {
    const fieldName = q.fields?.[0]?.name
    if (!fieldName) continue
    if (standardFields.includes(fieldName)) continue

    const answer = matchGreenhouseQuestion(q, userData)
    const fieldType = q.fields?.[0]?.type

    if (fieldType === "multi_value_single_select" || fieldType === "single_select") {
      const optionValue = matchSelectOption(q, answer as string)
      if (optionValue !== null) {
        form.append(`${fieldName}`, String(optionValue))
        await logAndStream(applicationId, onStep, "info",
          `[Direct API] ✓ Question: "${q.label}" → Mapped`, { step: 7 + mappedCount })
        mappedCount++
      } else {
        unmappedFields.push(q.label || fieldName)
        skippedCount++
        await logAndStream(applicationId, onStep, "info",
          `[Direct API] ✗ Question: "${q.label}" → No matching data (${fieldType})`, { step: 7 + mappedCount + skippedCount })
      }
    } else if (answer !== null) {
      form.append(`${fieldName}`, String(answer))
      await logAndStream(applicationId, onStep, "info",
        `[Direct API] ✓ Question: "${q.label}" → Mapped`, { step: 7 + mappedCount })
      mappedCount++
    } else {
      unmappedFields.push(q.label || fieldName)
      skippedCount++
      await logAndStream(applicationId, onStep, "info",
        `[Direct API] ✗ Question: "${q.label}" → No matching data`, { step: 7 + mappedCount + skippedCount })
    }
  }

  const totalCustom = mappedCount + skippedCount
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Mapped ${mappedCount}/${totalCustom} custom questions${skippedCount > 0 ? ` (${skippedCount} unmapped: ${unmappedFields.join(", ")})` : ""}`,
    { step: 8 + totalCustom })

  // Submit
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Submitting application to Greenhouse API...`,
    { step: 9 + totalCustom })

  const submitUrl = `https://boards-api.greenhouse.io/v1/boards/${ids.boardToken}/jobs/${ids.jobId}/applications`

  const response = await axios.post(submitUrl, form, {
    headers: { ...form.getHeaders() },
    timeout: 30000,
    validateStatus: () => true,
  })

  const processingTime = Date.now() - startTime

  if (response.status >= 200 && response.status < 300) {
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] ✅ Application submitted successfully (HTTP ${response.status}, ${Math.round(processingTime / 1000)}s, 0 Skyvern credits used)`,
      { step: 10 + totalCustom })

    return {
      success: true,
      result: `Application submitted via Greenhouse Direct API (${Math.round(processingTime / 1000)}s)`,
      steps: 0,
      recordingUrl: null,
      taskId: `direct-gh-${ids.jobId}`,
      unmappedFields,
      totalFields: totalCustom + standardFields.length,
      mappedFields: mappedCount + standardFields.length,
    }
  } else {
    const { missingFields, message } = parseApiError(response.status, response.data)
    if (missingFields.length > 0) {
      await logAndStream(applicationId, onStep, "error",
        `[Direct API] ❌ Greenhouse rejected: ${message} | Missing fields: ${missingFields.join(", ")}`,
        { step: 10 + totalCustom })
    }
    throw new Error(`Greenhouse API ${response.status}: ${message}${missingFields.length > 0 ? ` | Missing: ${missingFields.join(", ")}` : ""}`)
  }
}

// ─── Lever Direct Apply ───

async function applyLever(
  url: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<DirectApplyResponse> {
  const startTime = Date.now()
  const ids = parseLeverUrl(url)
  if (!ids) throw new Error(`Could not parse Lever URL: ${url}`)

  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Lever detected | Company: ${ids.company} | Posting: ${ids.postingId}`, { step: 1 })

  // Download resume
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Downloading resume...`, { step: 2 })
  const resume = await downloadResume(userData.resume)
  if (resume) {
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] Resume downloaded: ${resume.filename} (${Math.round(resume.buffer.length / 1024)}KB)`, { step: 3 })
  } else {
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] No resume available, continuing without it`, { step: 3 })
  }

  // Build form data
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Mapping user data to Lever fields...`, { step: 4 })

  const form = new FormData()
  form.append("name", userData.name || `${userData.firstName || ""} ${userData.lastName || ""}`.trim())
  form.append("email", userData.email || "")
  form.append("phone", userData.phone || "")
  form.append("org", "Unknown")

  if (resume) {
    form.append("resume", resume.buffer, { filename: resume.filename, contentType: "application/pdf" })
  }

  if (userData.linkedinUrl) form.append("urls[LinkedIn]", userData.linkedinUrl)
  if (userData.githubUrl) form.append("urls[GitHub]", userData.githubUrl)
  if (userData.coverLetter) form.append("comments", userData.coverLetter)

  if (userData.gender) form.append("eeo[gender]", userData.gender)
  if (userData.ethnicity) form.append("eeo[race]", userData.ethnicity)
  if (userData.veteranStatus) form.append("eeo[veteran]", userData.veteranStatus)
  if (userData.disabilityStatus) form.append("eeo[disability]", userData.disabilityStatus)

  const attachedFields = [
    userData.linkedinUrl && "LinkedIn",
    userData.githubUrl && "GitHub",
    userData.coverLetter && "cover letter",
    resume && "resume",
  ].filter(Boolean).join(", ")

  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Form data prepared with: ${attachedFields || "basic fields only"}`, { step: 5 })

  // Submit
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Submitting application to Lever API...`, { step: 6 })

  const submitUrl = `https://api.lever.co/v0/postings/${ids.company}/${ids.postingId}`

  const response = await axios.post(submitUrl, form, {
    headers: { ...form.getHeaders() },
    timeout: 30000,
    validateStatus: () => true,
  })

  const processingTime = Date.now() - startTime

  if (response.status >= 200 && response.status < 300) {
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] ✅ Application submitted successfully (HTTP ${response.status}, ${Math.round(processingTime / 1000)}s, 0 Skyvern credits used)`,
      { step: 7 })

    return {
      success: true,
      result: `Application submitted via Lever Direct API (${Math.round(processingTime / 1000)}s)`,
      steps: 0,
      recordingUrl: null,
      taskId: `direct-lever-${ids.postingId}`,
      unmappedFields: [],
      totalFields: 7,
      mappedFields: 7,
    }
  } else {
    const { missingFields, message } = parseApiError(response.status, response.data)
    throw new Error(`Lever API ${response.status}: ${message}${missingFields.length > 0 ? ` | Missing: ${missingFields.join(", ")}` : ""}`)
  }
}

// ─── Ashby Direct Apply ───

async function applyAshby(
  url: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<DirectApplyResponse> {
  const startTime = Date.now()
  const ids = parseAshbyUrl(url)
  if (!ids) throw new Error(`Could not parse Ashby URL: ${url}`)

  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Ashby detected | Org: ${ids.orgSlug} | Job: ${ids.jobId}`, { step: 1 })

  // Fetch job posting info via GraphQL
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Fetching job posting info from Ashby GraphQL API...`, { step: 2 })

  let jobPostingInfo: any = null
  let applicationForm: any = null
  try {
    const infoRes = await axios.post(
      `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPostingWithBoard`,
      {
        operationName: "ApiJobPostingWithBoard",
        variables: { organizationHostedJobsPageName: ids.orgSlug, jobPostingId: ids.jobId },
        query: `query ApiJobPostingWithBoard($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
          jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
            id title applicationForm { sections { title fieldEntries { ... on FormFieldEntry { field } } } }
          }
        }`
      },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    )
    jobPostingInfo = infoRes.data?.data?.jobPosting
    if (!jobPostingInfo) throw new Error("No job posting info returned")
    applicationForm = jobPostingInfo.applicationForm

    const fieldCount = applicationForm?.sections?.reduce((acc: number, s: any) => acc + (s.fieldEntries?.length || 0), 0) || 0
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] Found job: "${jobPostingInfo.title}" with ${fieldCount} form fields`, { step: 3 })
  } catch (err: any) {
    throw new Error(`Failed to fetch Ashby job info: ${err.message}`)
  }

  // Ashby requires reCAPTCHA for submission via ApiSubmitSingleApplicationFormAction
  // Try the submission — it will fail with captcha error but we attempt it anyway
  // in case some orgs have captcha disabled

  // Download resume
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Downloading resume...`, { step: 4 })
  const resume = await downloadResume(userData.resume)
  if (resume) {
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] Resume downloaded: ${resume.filename} (${Math.round(resume.buffer.length / 1024)}KB)`, { step: 5 })
  }

  // Try submitting via the GraphQL mutation
  await logAndStream(applicationId, onStep, "info",
    `[Direct API] Attempting Ashby GraphQL submission...`, { step: 6 })

  const submitRes = await axios.post(
    `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiSubmitSingleApplicationFormAction`,
    {
      operationName: "ApiSubmitSingleApplicationFormAction",
      variables: {
        organizationHostedJobsPageName: ids.orgSlug,
        jobPostingId: ids.jobId,
        formRenderIdentifier: "",
        actionIdentifier: "",
        recaptchaToken: "",
      },
      query: `mutation ApiSubmitSingleApplicationFormAction($organizationHostedJobsPageName: String!, $jobPostingId: String!, $formRenderIdentifier: String!, $actionIdentifier: String!, $recaptchaToken: String!) {
        submitSingleApplicationFormAction(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId, formRenderIdentifier: $formRenderIdentifier, actionIdentifier: $actionIdentifier, recaptchaToken: $recaptchaToken) { __typename }
      }`
    },
    { headers: { "Content-Type": "application/json" }, timeout: 15000, validateStatus: () => true }
  )

  const processingTime = Date.now() - startTime
  const resData = submitRes.data

  // Check if it somehow succeeded (unlikely without captcha, but possible for some orgs)
  if (resData?.data?.submitSingleApplicationFormAction && !resData?.errors?.length) {
    await logAndStream(applicationId, onStep, "info",
      `[Direct API] ✅ Ashby application submitted successfully (${Math.round(processingTime / 1000)}s, 0 Skyvern credits)`,
      { step: 7 })
    return {
      success: true,
      result: `Application submitted via Ashby Direct API (${Math.round(processingTime / 1000)}s)`,
      steps: 0,
      recordingUrl: null,
      taskId: `direct-ashby-${ids.jobId}`,
    }
  }

  // Expected: captcha or validation error
  const errorMsg = resData?.errors?.[0]?.message || JSON.stringify(resData)
  throw new Error(`Ashby API rejected: ${errorMsg}`)
}

// ─── Main Entry Point ───

export type DirectApplyPortal = "Greenhouse" | "Lever" | "Ashby"

const DIRECT_APPLY_HANDLERS: Record<DirectApplyPortal, (url: string, userData: any, onStep?: StreamCallback, applicationId?: string) => Promise<DirectApplyResponse>> = {
  Greenhouse: applyGreenhouse,
  Lever: applyLever,
  Ashby: applyAshby,
}

export function canDirectApply(portalName: string): portalName is DirectApplyPortal {
  return portalName in DIRECT_APPLY_HANDLERS
}

export async function directApply(
  portalName: DirectApplyPortal,
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string
): Promise<DirectApplyResponse> {
  const startTime = Date.now()
  const handler = DIRECT_APPLY_HANDLERS[portalName]

  try {
    if (applicationId) {
      await persistLog(applicationId, "info",
        `Starting Direct API application for ${userData.name || userData.firstName} | ${portalName} portal | Engine: Direct API (0 credits)`)
    }

    if (onStep) {
      onStep({ status: "session_created", log: `Submitting via ${portalName} Direct API (0 Skyvern credits)...` })
    }

    const result = await handler(portalUrl, userData, onStep, applicationId)

    if (applicationId) {
      try {
        await supabase.from("portal_metrics").insert({
          portal_type: portalName,
          application_id: applicationId,
          response_time_ms: Date.now() - startTime,
          status: result.success ? "success" : "failure",
          error_message: result.success ? null : result.error,
        })
      } catch (err) {
        console.error("Failed to log portal metrics:", err)
      }
    }

    return result
  } catch (error) {
    const processingTime = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : "Unknown error"

    console.error(`Direct API error (${portalName}):`, error)

    if (applicationId) {
      await persistLog(applicationId, "error", `[Direct API] ❌ Failed: ${errorMsg}`)
      await persistLog(applicationId, "info", `[Direct API] Falling back to Skyvern browser automation...`)

      try {
        await supabase.from("portal_metrics").insert({
          portal_type: portalName,
          application_id: applicationId,
          response_time_ms: processingTime,
          status: "failure",
          error_message: `Direct API failed: ${errorMsg}`,
        })
      } catch (err) {
        console.error("Failed to log portal metrics:", err)
      }
    }

    if (onStep) {
      onStep({ status: "error", log: `[Direct API] Failed: ${errorMsg}. Falling back to Skyvern...` })
    }

    return { success: false, error: `Direct API failed: ${errorMsg}` }
  }
}

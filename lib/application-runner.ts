/**
 * Runs one already-claimed application from start to its final queue state.
 *
 * The worker and the manual Start route both call this, so a row ends up in the
 * same tab however it was started. The caller must hold the row's lease.
 */

import { fillJobApplication, type StreamCallback } from "@/lib/automation-provider"
import { resolvePhoneCountry, usablePhone } from "@/lib/phone-country"
import { preflight, persistPreflight, recordRunOutcome } from "@/lib/preflight"
import { finishTiming } from "@/lib/run-timing"
import { checkJobLiveness, checkResume, decideRunAction, resolveDirectApplyUrl } from "@/lib/run-outcome"
import { createAdminClient } from "@/lib/supabase/admin"
import { DRY_RUN, usesPositiveAnswers } from "@/lib/test-candidates"

export const LEASE_SECONDS = 300
const LEASE_RENEW_MS = 60_000
/** A hung run stops renewing here, so its lease expires and the slot frees itself. */
const MAX_RUN_MS = 30 * 60_000

const APP_COLUMNS = "id, user_id, job_id, job_url, first_name, last_name, email, phone, location, gender, ethnicity, disability_status, veteran_status, work_authorization_status, headline, bio, linkedin_url, github_url, resume_url, cover_letter, experience, education, certifications, achievements, top_skills, skills, job_preferences, work_mode_preferences, salary_currency, salary_min, salary_max, attempt_count, max_attempts, company_name, job_title, last_error"

export type RunSummary =
  | { outcome: "completed"; result?: unknown; steps?: unknown; recordingUrl?: string | null; taskId?: string | null; attempt: number; maxAttempts: number }
  | { outcome: "dry_run"; wouldBe: string; error?: string | null }
  | { outcome: "retrying" | "failed" | "blocked" | "awaiting_captcha" | "awaiting_otp" | "deleted" | "missing"; error?: string | null; attempt?: number; maxAttempts?: number }

/** resume_url holds either a full URL or a filename in the user's storage folder. */
export function resolveResumeUrl(app: { resume_url?: string | null; user_id?: string | null }): string {
  const value = (app.resume_url || "").trim()
  if (!value) return ""
  if (/^https?:\/\//i.test(value)) return value
  // Some rows store the path on our storage host rather than the full URL.
  if (value.startsWith("/")) return `${process.env.NEXT_PUBLIC_SUPABASE_URL}${value}`
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/resumes/${app.user_id}/${value}`
}

function buildFormData(app: any) {
  const resume = resolveResumeUrl(app)
  return {
    name: `${app.first_name} ${app.last_name}`,
    companyName: app.company_name,
    jobTitle: app.job_title,
    firstName: app.first_name,
    lastName: app.last_name,
    email: app.email,
    phone: app.phone,
    location: app.location,
    gender: app.gender,
    ethnicity: app.ethnicity,
    disabilityStatus: app.disability_status,
    veteranStatus: app.veteran_status,
    workAuthorization: app.work_authorization_status,
    headline: app.headline,
    bio: app.bio,
    linkedinUrl: app.linkedin_url,
    githubUrl: app.github_url,
    resume,
    coverLetter: app.cover_letter,
    experience: app.experience?.map((e: any) => `${e.title} at ${e.company} (${e.startDate} - ${e.isCurrent ? "Present" : e.endDate}) - ${e.description}`).join("\n") || "",
    education: app.education?.map((e: any) => `${e.degree} in ${e.field || e.course} from ${e.institution || e.university} (${e.startDate} - ${e.endDate})`).join("\n") || "",
    // Forms ask for School, Degree and Discipline in separate dropdowns, which
    // the prose above cannot answer.
    educationEntries: app.education || [],
    experienceEntries: app.experience || [],
    certifications: app.certifications?.map((c: any) => `${c.name} - ${c.issuingOrganization}`).join("\n") || "",
    achievements: app.achievements?.map((a: any) => `${a.title} (${a.date}) - ${a.issuer}: ${a.description}`).join("\n") || "",
    skills: app.top_skills || app.skills || [],
    jobPreferences: app.job_preferences || [],
    workModePreferences: app.work_mode_preferences || [],
    salaryCurrency: app.salary_currency,
    salaryMin: app.salary_min,
    salaryMax: app.salary_max,
  }
}

export async function runClaimedApplication(
  applicationId: string,
  workerId: string,
  onStep?: StreamCallback
): Promise<RunSummary> {
  const supabase = createAdminClient()
  const startedAt = Date.now()

  const renew = setInterval(() => {
    if (Date.now() - startedAt > MAX_RUN_MS) return
    supabase
      .rpc("renew_application_lease", { p_id: applicationId, p_worker: workerId, p_lease_seconds: LEASE_SECONDS })
      .then(({ error }) => { if (error) console.error(`[runner] lease renew failed for ${applicationId}: ${error.message}`) })
  }, LEASE_RENEW_MS)

  // Only the run still holding the lease may write: a killed or reclaimed run
  // finishing late must not overwrite the status that was set after it.
  const update = async (fields: Record<string, unknown>) => {
    const { error } = await supabase
      .from("live_application_queue")
      .update(fields)
      .eq("id", applicationId)
      .eq("lease_owner", workerId)
    if (error) console.error(`[runner] could not update ${applicationId}: ${error.message}`)
  }

  /** application_logs requires an id, and an insert without one fails silently. */
  const writeLog = async (level: string, message: string) => {
    const { error } = await supabase.from("application_logs").insert({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      application_id: applicationId,
      level,
      agent_id: applicationId, // this column is a UUID, not a worker name
      message,
    })
    if (error) console.error(`[runner] could not write log for ${applicationId}: ${error.message}`)
  }

  /**
   * A dry run submits nothing, so it must not move the row, spend a try, or trip
   * a portal breaker. It reports what WOULD have happened and puts the row back.
   */
  const finishDryRun = async (attemptsBefore: number, wouldBe: string, detail?: string | null): Promise<RunSummary> => {
    await writeLog("info", `DRY RUN result: would be ${wouldBe}${detail ? `. ${detail}` : ""}`)
    await update({ status: "pending", attempt_count: attemptsBefore, next_attempt_at: null, started_at: null, last_error: null, error_message: null })
    return { outcome: "dry_run", wouldBe, error: detail }
  }

  /**
   * Deleting a row cascades away its logs, so the full row and the reason are
   * copied to removed_applications first. If that copy fails, the row is kept.
   */
  const removeApplication = async (app: any, reason: string): Promise<RunSummary> => {
    const { data: fullRow } = await supabase.from("live_application_queue").select("*").eq("id", applicationId).single()
    const { error: copyError } = await supabase.from("removed_applications").upsert({
      id: applicationId,
      reason,
      company_name: app.company_name,
      job_title: app.job_title,
      job_url: app.job_url,
      row_data: fullRow ?? app,
    })
    if (copyError) {
      console.error(`[runner] not deleting ${applicationId}, could not archive it: ${copyError.message}`)
      await update({ status: "blocked", last_error: reason, error_message: reason })
      return { outcome: "blocked", error: reason }
    }
    await supabase.from("live_application_queue").delete().eq("id", applicationId)
    return { outcome: "deleted", error: reason }
  }

  try {
    const { data: app, error } = await supabase
      .from("live_application_queue")
      .select(APP_COLUMNS)
      .eq("id", applicationId)
      .single()
    if (error || !app) return { outcome: "missing", error: error?.message }

    // Verification codes and confirmations only reach us through the proxy address,
    // so it overrides whatever the queue row holds. Without one, the run doesn't start.
    const { data: proxy } = await supabase
      .from("proxy_emails")
      .select("proxy_address")
      .eq("user_id", app.user_id)
      .limit(1)
      .maybeSingle()
    if (!proxy?.proxy_address) {
      const reason = "No proxy email address on file for this candidate"
      await writeLog("error", `[Email] ${reason}. Not running with "${app.email}".`)
      await update({ status: "blocked", last_error: reason, error_message: reason })
      return { outcome: "blocked", error: reason }
    }
    if (proxy.proxy_address.toLowerCase() !== String(app.email || "").toLowerCase()) {
      await writeLog("warn", `[Email] queue row had "${app.email}", using proxy ${proxy.proxy_address}`)
      app.email = proxy.proxy_address
    }

    // Forms commonly require a location, and a profile may not have one.
    if (!app.location) {
      app.location = "Bangalore, India"
      await writeLog("warn", "[Gate] profile has no location, using Bangalore, India")
    }

    const profilePhone = app.phone
    app.phone = usablePhone(app.phone, resolvePhoneCountry({ phone: app.phone, location: app.location }).dial)
    if (app.phone !== profilePhone) await writeLog("warn", `[Gate] phone "${profilePhone ?? ""}" is unusable, using made-up number ${app.phone}`)

    const attempt = app.attempt_count || 1
    const maxAttempts = app.max_attempts || 3

    // The column can be empty while the file sits in the candidate's storage folder.
    if (!app.resume_url) {
      const { data: files } = await supabase.storage.from("resumes").list(app.user_id, { limit: 20 })
      const stored = (files ?? []).map((f) => f.name).find((n) => /\.(pdf|docx?)$/i.test(n))
      if (stored) {
        app.resume_url = stored
        await writeLog("info", `[Gate] resume_url was empty; using ${stored} from storage`)
      }
    }
    const noResume = await checkResume(resolveResumeUrl(app))
    if (noResume) return await removeApplication(app, noResume)

    const directUrl = await resolveDirectApplyUrl(app.job_url, app.company_name)
    const applyUrl = directUrl || app.job_url
    if (directUrl) await writeLog("info", `[Gate] resolved to the real form: ${app.job_url} -> ${directUrl}`)

    const dead = await checkJobLiveness(applyUrl)
    if (dead) {
      if (DRY_RUN) return await finishDryRun(attempt - 1, "deleted", dead)
      return await removeApplication(app, dead)
    }

    const positive = usesPositiveAnswers()

    const { data: job } = app.job_id
      ? await supabase
          .from("jobs")
          .select("work_authorization, experience, location, type, description, detailed_requirements")
          .eq("id", app.job_id)
          .maybeSingle()
      : { data: null }

    const gate = await preflight(supabase, app, job, { ignoreKnockouts: positive })
    await persistPreflight(supabase, applicationId, gate)
    if (!gate.allow) {
      if (DRY_RUN) return await finishDryRun(attempt - 1, gate.retryable ? "held back" : "blocked", gate.reason)
      // The browser never ran, so this must not spend one of the row's tries.
      await update({
        status: gate.retryable ? "pending" : "blocked",
        attempt_count: Math.max(0, attempt - 1),
        last_error: gate.reason,
        error_message: gate.reason,
        next_attempt_at: gate.retryable ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
      })
      return { outcome: gate.retryable ? "retrying" : "blocked", error: gate.reason, attempt, maxAttempts }
    }

    const result = await fillJobApplication(applyUrl, { ...buildFormData(app), positiveAnswers: positive, forceResidential: /bot check|automated|spam/i.test(app.last_error || "") }, onStep, applicationId, app.user_id)
    const action = decideRunAction(result, attempt, maxAttempts)
    if (DRY_RUN) return await finishDryRun(attempt - 1, action.kind, result.error)

    await recordRunOutcome(supabase, gate.portalName, {
      success: result.success,
      error: result.error || null,
      portalFault: result.failure?.portalFault,
    })

    if (action.kind === "delete") return await removeApplication(app, action.reason)

    const status = action.kind === "retry" ? "pending" : action.kind
    await writeLog(action.kind === "completed" ? "info" : "warn",
      `[Result] ${status.toUpperCase()} | attempt ${attempt}/${maxAttempts} | ${Math.round((Date.now() - startedAt) / 1000)}s | failure class: ${result.failure?.failureClass ?? "none"} | ${(result.error || "submission confirmed").slice(0, 300)}`)
    const { error: finishError } = await supabase
      .from("live_application_queue")
      .update({
        status,
        completed_at: action.kind === "completed" || action.kind === "failed" ? new Date().toISOString() : null,
        error_message: result.error || null,
        last_error: result.error || null,
        processing_time_ms: Date.now() - startedAt,
        recording_url: result.recordingUrl || null,
        next_attempt_at: action.kind === "retry" ? new Date(Date.now() + action.backoffSeconds * 1000).toISOString() : null,
        ...(action.kind === "retry" && !action.countsAsAttempt ? { attempt_count: Math.max(0, attempt - 1) } : {}),
        ...(result.failure
          ? {
              failure_class: result.failure.failureClass,
              failure_cause: result.failure.rootCause,
              failure_action: result.failure.suggestedAction,
              failure_permanent: result.failure.permanent,
              failure_portal_fault: result.failure.portalFault,
            }
          : {}),
      })
      .eq("id", applicationId)
      .eq("lease_owner", workerId)
      // kernel.ts writes `completed` itself the moment it sees the confirmation.
      .neq("status", "completed")
    if (finishError) console.error(`[runner] could not finish ${applicationId}: ${finishError.message}`)

    if (action.kind === "completed") {
      return { outcome: "completed", result: result.result, steps: result.steps, recordingUrl: result.recordingUrl, taskId: result.taskId, attempt, maxAttempts }
    }
    return { outcome: action.kind === "retry" ? "retrying" : action.kind, error: result.error, attempt, maxAttempts }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const { data } = await supabase
      .from("live_application_queue")
      .select("attempt_count, max_attempts")
      .eq("id", applicationId)
      .maybeSingle()
    const attempt = data?.attempt_count || 1
    const maxAttempts = data?.max_attempts || 3
    const action = decideRunAction({ error: message }, attempt, maxAttempts)
    await update({
      status: action.kind === "retry" ? "pending" : action.kind === "awaiting_captcha" ? "awaiting_captcha" : "failed",
      error_message: message,
      last_error: message,
      processing_time_ms: Date.now() - startedAt,
      next_attempt_at: action.kind === "retry" ? new Date(Date.now() + action.backoffSeconds * 1000).toISOString() : null,
      ...(action.kind === "retry" && !action.countsAsAttempt ? { attempt_count: Math.max(0, attempt - 1) } : {}),
    })
    return { outcome: action.kind === "retry" ? "retrying" : action.kind === "awaiting_captcha" ? "awaiting_captcha" : "failed", error: message, attempt, maxAttempts }
  } finally {
    await writeLog("info", finishTiming(applicationId))
    clearInterval(renew)
    await update({ lease_owner: null, lease_expires_at: null })
  }
}

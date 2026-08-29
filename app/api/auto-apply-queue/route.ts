import { fillJobApplication } from "@/lib/automation-provider"
import { createAdminClient } from '@/lib/supabase/admin'
import { preflight, persistPreflight, recordRunOutcome } from "@/lib/preflight"
import { withDistributedSlot } from "@/lib/distributed-gate"
import { getKernelApiKey } from "@/lib/kernel"

export async function POST(request: Request) {
  try {
    const { applicationId, stream } = await request.json()

    if (!applicationId) {
      return Response.json({ error: "Missing applicationId" }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    const { data: app, error } = await supabase
      .from('live_application_queue')
      .select('id, user_id, job_id, job_url, first_name, last_name, email, phone, location, gender, ethnicity, disability_status, veteran_status, work_authorization_status, headline, bio, linkedin_url, github_url, resume_url, cover_letter, experience, education, certifications, achievements, top_skills, skills, job_preferences, work_mode_preferences, salary_currency, salary_min, salary_max, attempt_count, max_attempts, company_name, job_title')
      .eq('id', applicationId)
      .single()

    if (error || !app) {
      return Response.json({ error: "Application not found" }, { status: 404 })
    }

    console.log(`[auto-apply-queue] App ID: ${applicationId}`)
    console.log(`[auto-apply-queue] job_url: ${app.job_url}`)
    console.log(`[auto-apply-queue] Name: ${app.first_name} ${app.last_name}`)
    console.log(`[auto-apply-queue] Email: ${app.email}`)
    console.log(`[auto-apply-queue] Resume: ${app.resume_url}`)

    // ─── Pre-flight gate ───
    // Runs before any browser session exists. Refuses applications we already
    // know will fail (explicit knockout, missing required profile field,
    // unrecognized portal) and applications to a portal whose breaker is open.
    // Every refusal here is a session, a proxy, and a handful of LLM calls saved.
    const { data: job } = app.job_id
      ? await supabase
          .from('jobs')
          .select('work_authorization, experience, location, type, description, detailed_requirements')
          .eq('id', app.job_id)
          .maybeSingle()
      : { data: null }

    const gate = await preflight(supabase, app, job)
    await persistPreflight(supabase, applicationId, gate)

    if (!gate.allow) {
      // `retryable` distinguishes "come back later" (open breaker, fixable
      // profile) from "never" (explicit knockout, unknown portal). Retryable
      // rows stay pending so the next queue cycle picks them up; terminal ones
      // are parked in the "Won't apply" bucket rather than burning retries.
      await supabase
        .from('live_application_queue')
        .update({
          status: gate.retryable ? 'pending' : 'blocked',
          last_error: gate.reason,
          error_message: gate.reason,
        })
        .eq('id', applicationId)

      console.log(`[auto-apply-queue] BLOCKED (${gate.blockKind}): ${gate.reason}`)
      return Response.json({
        success: false,
        blocked: true,
        blockKind: gate.blockKind,
        retryable: gate.retryable,
        message: gate.reason,
        knockouts: gate.knockouts,
        coverage: gate.coverage,
      }, { status: 200 })
    }

    const currentAttempt = (app.attempt_count || 0) + 1

    await supabase
      .from('live_application_queue')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
        attempt_count: currentAttempt,
      })
      .eq('id', applicationId)

    const resumeUrl = app.resume_url ? 
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/resumes/${app.user_id}/${app.resume_url}` : ""

    const experienceText = app.experience?.map((exp: any) => 
      `${exp.title} at ${exp.company} (${exp.startDate} - ${exp.isCurrent ? 'Present' : exp.endDate}) - ${exp.description}`
    ).join('\n') || ""

    const educationText = app.education?.map((edu: any) => 
      `${edu.degree} in ${edu.field || edu.course} from ${edu.institution || edu.university} (${edu.startDate} - ${edu.endDate})`
    ).join('\n') || ""

    const certificationsText = app.certifications?.map((cert: any) => 
      `${cert.name} - ${cert.issuingOrganization}`
    ).join('\n') || ""

    const achievementsText = app.achievements?.map((ach: any) => 
      `${ach.title} (${ach.date}) - ${ach.issuer}: ${ach.description}`
    ).join('\n') || ""

    const formData = {
      name: `${app.first_name} ${app.last_name}`,
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
      resume: resumeUrl,
      coverLetter: app.cover_letter,
      experience: experienceText,
      education: educationText,
      certifications: certificationsText,
      achievements: achievementsText,
      skills: app.top_skills || app.skills || [],
      jobPreferences: app.job_preferences || [],
      workModePreferences: app.work_mode_preferences || [],
      salaryCurrency: app.salary_currency,
      salaryMin: app.salary_min,
      salaryMax: app.salary_max,
    }

    if (stream) {
      return new Response(
        new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()
            const startTime = Date.now()
            let closed = false

            const safeEnqueue = (data: string) => {
              if (!closed) {
                try { controller.enqueue(encoder.encode(data)) } catch { closed = true }
              }
            }

            const safeClose = () => {
              if (!closed) {
                closed = true
                try { controller.close() } catch {}
              }
            }

            try {
              const onStep = (step: any) => {
                safeEnqueue(`data: ${JSON.stringify(step)}\n\n`)
              }

              // Gate: never start more browsers at once than the plan allows.
              // Waiting for a slot is better than being rejected by the API and
              // marked failed on a posting that was perfectly fine.
              const result = await withDistributedSlot(async (slot) => {
                if (slot.waited) {
                  onStep({ status: "in_progress", log: `Waited ${Math.round(slot.waitedMs / 1000)}s for a free browser slot (${slot.active}/${slot.limit} active)` })
                }
                return fillJobApplication(
                  app.job_url,
                  formData,
                  onStep,
                  applicationId,
                  app.user_id
                )
              })

              const processingTime = Date.now() - startTime

              const maxAttempts = app.max_attempts || 2
              // A permanent failure — a closed posting, an SSO wall, a page that
              // was never an application — will produce the identical outcome on
              // every retry. Re-queuing it burns a browser session to learn
              // nothing, so the diagnosis ends the attempt sequence outright.
              const permanent = result.failure?.permanent === true
              const canRetry = !result.success && !permanent && currentAttempt < maxAttempts
              const finalStatus = result.success ? 'completed' : (canRetry ? 'pending' : 'failed')

              await supabase
                .from('live_application_queue')
                .update({
                  status: finalStatus,
                  completed_at: result.success ? new Date().toISOString() : null,
                  error_message: result.error || null,
                  last_error: result.error || null,
                  processing_time_ms: processingTime,
                  recording_url: result.recordingUrl || null,
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
                .eq('id', applicationId)

              // Feed the portal breaker so a run of failures stops the bleeding.
              await recordRunOutcome(supabase, gate.portalName, {
                success: result.success,
                error: result.error || null,
                portalFault: result.failure?.portalFault,
              })

              // Send the REAL terminal status, not a hardcoded "completed".
              // finalStatus is 'completed' | 'pending' (retry) | 'failed'. Map to the
              // stream vocabulary the client already understands.
              const streamStatus = result.success ? "completed" : (canRetry ? "retrying" : "error")
              safeEnqueue(`data: ${JSON.stringify({
                status: streamStatus,
                success: result.success,
                error: result.error || null,
                // The client renders "Attempt {attempt}/{maxAttempts}" on a
                // retry; without these it printed "Attempt undefined/undefined".
                attempt: currentAttempt,
                maxAttempts,
                result: result.result,
                steps: result.steps,
                recordingUrl: result.recordingUrl,
                taskId: result.taskId,
              })}\n\n`)

              safeClose()
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : "Unknown error"
              
              const maxAttempts = app.max_attempts || 2
              const canRetry = currentAttempt < maxAttempts
              const finalStatus = canRetry ? 'pending' : 'failed'

              await supabase
                .from('live_application_queue')
                .update({
                  status: finalStatus,
                  completed_at: canRetry ? null : new Date().toISOString(),
                  error_message: errorMsg,
                  last_error: errorMsg,
                  processing_time_ms: Date.now() - startTime
                })
                .eq('id', applicationId)

              await recordRunOutcome(supabase, gate.portalName, { success: false, error: errorMsg })

              safeEnqueue(`data: ${JSON.stringify({
                status: canRetry ? "retrying" : "error",
                error: errorMsg,
                attempt: currentAttempt,
                maxAttempts,
              })}\n\n`)
              safeClose()
            }
          },
        }),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        }
      )
    }

    const startTime = Date.now()
    const result = await withDistributedSlot(() =>
      fillJobApplication(
        app.job_url,
        formData,
        undefined,
        applicationId,
        app.user_id
      )
    )

    const processingTime = Date.now() - startTime

    const maxAttempts = app.max_attempts || 2
    const permanent = result.failure?.permanent === true
    const canRetry = !result.success && !permanent && currentAttempt < maxAttempts
    const finalStatus = result.success ? 'completed' : (canRetry ? 'pending' : 'failed')

    await supabase
      .from('live_application_queue')
      .update({
        status: finalStatus,
        completed_at: result.success ? new Date().toISOString() : (canRetry ? null : new Date().toISOString()),
        error_message: result.error || null,
        last_error: result.error || null,
        processing_time_ms: processingTime,
        recording_url: result.recordingUrl || null,
      })
      .eq('id', applicationId)

    await recordRunOutcome(supabase, gate.portalName, {
      success: result.success,
      error: result.error || null,
      portalFault: result.failure?.portalFault,
    })

    return Response.json({
      success: result.success,
      message: result.success ? "Application submitted successfully" : (canRetry ? `Attempt ${currentAttempt} failed, will retry` : "Application failed"),
      result: result.result,
      steps: result.steps,
      recordingUrl: result.recordingUrl,
      taskId: result.taskId,
      attempt: currentAttempt,
      maxAttempts,
    })
  } catch (error) {
    console.error("Auto-apply queue error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

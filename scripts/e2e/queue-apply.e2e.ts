import { describe, it } from "vitest"
import { createClient } from "@supabase/supabase-js"
import fs from "fs"
import { randomUUID } from "crypto"

/**
 * Run an application through the REAL queue, the way production does.
 *
 * apply.e2e.ts calls the runner directly with a synthetic id (`e2e-<ts>`). That
 * keeps the queue clean, and it also means nothing is ever stored: the id is not
 * a UUID, so every write the run attempts is rejected by Postgres —
 *
 *   invalid input syntax for type uuid: "e2e-1788079..."
 *
 * — taking the logs, the run timeline, the answer bank, the confirmation id and
 * processing_time_ms with it. Which is why application_answers, domain_skills and
 * performance_metrics are all empty, and why every processing_time_ms is NULL.
 *
 * This harness inserts a genuine queue row first, so the run persists exactly as
 * a production one does, including the cost basis the queue page now displays and
 * the queue-id path the OTP webhook matches on.
 *
 *   E2E_URL=<jobUrl> E2E_PROFILE=<uuid> \
 *     npx vitest run --config scripts/e2e/vitest.e2e.config.ts scripts/e2e/queue-apply.e2e.ts
 *
 * Submits for real. Set E2E_DRY_RUN=1 to stop at the submit gate.
 */
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
) as Record<string, string>
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v

const jobUrl = process.env.E2E_URL || ""
const profileId = process.env.E2E_PROFILE || ""
const DRY = process.env.E2E_DRY_RUN === "1"

process.env.KERNEL_CONSOLE_LOGS = "1"
if (DRY) process.env.KERNEL_DRY_RUN = "1"

describe("auto-apply via the real queue", () => {
  it("stores everything a production run stores", async () => {
    if (!jobUrl || !profileId) throw new Error("Set E2E_URL and E2E_PROFILE")
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const { data: p, error } = await sb.from("profiles").select("*").eq("id", profileId).single()
    if (error) throw new Error("Could not load profile: " + error.message)

    const resumeUrl = p.resume_url
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/resumes/${p.id}/${p.resume_url}`
      : ""
    const join = (arr: any[] | null, fn: any) => (arr || []).map(fn).join("\n")

    // ─── A real row, with a real UUID ───
    // Everything the run writes is keyed on this id, so it has to exist before
    // the run starts and has to be a UUID for Postgres to accept the foreign key.
    const applicationId = randomUUID()

    // job_id is NOT NULL, and it is what ties the application back to the posting
    // for every downstream report. These URLs come from the jobs table, so the row
    // already exists — matching on job_url keeps company_name and job_title
    // truthful rather than reconstructed from the URL path.
    const { data: job } = await sb
      .from("jobs")
      .select("id, company_name, title")
      .eq("job_url", jobUrl)
      .limit(1)
      .maybeSingle()
    if (!job) throw new Error(`No jobs row for ${jobUrl} — the queue needs a job_id, so pick a URL from the jobs table.`)

    const { error: insErr } = await sb.from("live_application_queue").insert({
      id: applicationId,
      job_id: job.id,
      user_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      email: p.email,
      phone: p.phone,
      country_code: p.country_code,
      location: p.location,
      gender: p.gender,
      ethnicity: p.ethnicity,
      veteran_status: p.veteran_status,
      disability_status: p.disability_status,
      work_authorization_status: p.work_authorization_status,
      headline: p.headline,
      bio: p.bio,
      resume_url: p.resume_url,
      linkedin_url: p.linkedin_url,
      github_url: p.github_url,
      skills: p.top_skills || p.skills || [],
      experience: p.experience,
      education: p.education,
      certifications: p.certifications,
      achievements: p.achievements,
      salary_currency: p.salary_currency,
      salary_min: p.salary_min,
      salary_max: p.salary_max,
      cover_letter: p.cover_letter,
      job_url: jobUrl,
      company_name: job.company_name || "unknown",
      job_title: job.title || "(untitled)",
      status: "processing",
      started_at: new Date().toISOString(),
    })
    if (insErr) throw new Error("Could not create queue row: " + insErr.message)

    const userData = {
      name: `${p.first_name} ${p.last_name}`.trim(),
      firstName: p.first_name,
      lastName: p.last_name,
      email: p.email,
      phone: p.phone,
      countryCode: p.country_code,
      location: p.location,
      gender: p.gender,
      ethnicity: p.ethnicity,
      disabilityStatus: p.disability_status,
      veteranStatus: p.veteran_status,
      workAuthorization: p.work_authorization_status,
      headline: p.headline,
      bio: p.bio,
      linkedinUrl: p.linkedin_url,
      githubUrl: p.github_url,
      resume: resumeUrl,
      coverLetter: p.cover_letter,
      experience: join(p.experience, (e: any) => `${e.title} at ${e.company} (${e.startDate} - ${e.isCurrent ? "Present" : e.endDate}) - ${e.description}`),
      education: join(p.education, (e: any) => `${e.degree} in ${e.field || e.course} from ${e.institution || e.university} (${e.startDate} - ${e.endDate})`),
      educationEntries: p.education || [],
      experienceEntries: p.experience || [],
      certifications: join(p.certifications, (c: any) => `${c.name} - ${c.issuingOrganization}`),
      achievements: join(p.achievements, (a: any) => `${a.title} (${a.date}) - ${a.issuer}: ${a.description}`),
      skills: p.top_skills || p.skills || [],
      jobPreferences: p.job_preferences || [],
      workModePreferences: p.work_mode_preferences || [],
      salaryCurrency: p.salary_currency,
      salaryMin: p.salary_min,
      salaryMax: p.salary_max,
      proxyEmail: p.proxy_email || p.email,
      jobTitle: "",
      companyName: "",
    }

    const line = (c = "━") => console.log(c.repeat(100))
    console.log(""); line()
    console.log(`  QUEUE RUN  ${applicationId}`)
    console.log(`  ${jobUrl}`)
    console.log(`  ${DRY ? "DRY RUN — stops at the submit gate" : "*** LIVE — WILL SUBMIT ***"}`)
    line()

    const { fillJobApplicationWithKernel } = await import("@/lib/kernel")
    const t0 = Date.now()
    const result = await fillJobApplicationWithKernel(
      jobUrl,
      userData,
      (s: any) => {
        const t = ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
        if (s.log) console.log(`[${t}s] STEP ${s.status ? `(${s.status}) ` : ""}${s.log}`)
        if (s.error) console.log(`[${t}s] STEP ERROR ${s.error}`)
      },
      applicationId,
      p.id
    )

    const processingTime = Date.now() - t0
    // Written here rather than left to the caller: this is the cost basis the
    // queue page reads, and a run that does not record it shows no cost at all.
    await sb.from("live_application_queue").update({
      status: result.success ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      processing_time_ms: processingTime,
      error_message: result.error || null,
      confirmation_id: (result as any).confirmationId || null,
      recording_url: (result as any).recordingUrl || null,
    }).eq("id", applicationId)

    console.log(""); line()
    console.log("  RESULT"); line()
    console.log(JSON.stringify(result, null, 2))
    console.log(`\n  Wall clock: ${(processingTime / 1000).toFixed(1)}s`)

    // What actually persisted — the point of this harness.
    const [{ count: logs }, { count: answers }, { data: row }] = await Promise.all([
      sb.from("application_logs").select("*", { count: "exact", head: true }).eq("application_id", applicationId),
      sb.from("application_answers").select("*", { count: "exact", head: true }).eq("user_id", p.id),
      sb.from("live_application_queue").select("processing_time_ms, confirmation_id, run_timeline").eq("id", applicationId).single(),
    ])
    console.log(`  Stored: ${logs ?? 0} log rows · ${answers ?? 0} answer-bank rows`)
    console.log(`  processing_time_ms=${row?.processing_time_ms} confirmation_id=${row?.confirmation_id ?? "none"} timeline=${row?.run_timeline ? "yes" : "no"}`)
    console.log(`  Queue row: ${applicationId}`)
  })
})

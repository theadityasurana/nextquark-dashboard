import { describe, it } from "vitest"
import { createClient } from "@supabase/supabase-js"
import fs from "fs"

/**
 * End-to-end: run the real auto-apply pipeline against one job URL.
 *
 * Loads a real candidate profile, builds `userData` exactly the way
 * app/api/auto-apply-queue does, and calls the real
 * `fillJobApplicationWithKernel` — same browser, same scanners, same routing
 * policy, same submit gate.
 *
 * Submits for real, exactly like production. Set E2E_DRY_RUN=1 to fill and
 * audit without clicking the final button.
 *
 *   E2E_URL=<jobUrl> E2E_PROFILE=<uuid> \
 *     npx vitest run --config scripts/e2e/vitest.e2e.config.ts
 */

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["\']|["\']$/g, "")]
    })
) as Record<string, string>
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v

const jobUrl = process.env.E2E_URL || ""
const profileId = process.env.E2E_PROFILE || ""

// Submits for real by default — the same behaviour as production. Set
// E2E_DRY_RUN=1 to fill and audit without clicking the final button.
const DRY = process.env.E2E_DRY_RUN === "1"

process.env.KERNEL_CONSOLE_LOGS = "1"
if (DRY) process.env.KERNEL_DRY_RUN = "1"
if (process.env.E2E_ALLOW_NO_LLM === "1") process.env.KERNEL_ALLOW_NO_LLM = "1"

describe("auto-apply end-to-end", () => {
  it("fills and submits a real application", async () => {
    if (!jobUrl || !profileId) throw new Error("Set E2E_URL and E2E_PROFILE")
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const line = (c = "─") => console.log(c.repeat(100))
    const banner = (t: string) => {
      console.log("")
      line("━")
      console.log(`  ${t}`)
      line("━")
    }

    // ─── profile → userData, mirroring app/api/auto-apply-queue/route.ts ───
    const { data: p, error } = await sb.from("profiles").select("*").eq("id", profileId).single()
    if (error) throw new Error("Could not load profile: " + error.message)

    const resumeUrl = p.resume_url
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/resumes/${p.id}/${p.resume_url}`
      : ""

    const join = (arr: any[] | null, fn: any) => (arr || []).map(fn).join("\n")
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
      // Mirrors app/api/auto-apply-queue: forms ask for School / Degree /
      // Discipline separately, and the prose above cannot answer a dropdown.
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
      yearsOfExperience: p.experience_level === "entry_level" ? 1 : undefined,
      jobTitle: "",
      companyName: "",
    }

    // ─── what we are about to do ───
    const mask = (s: any) => (!s ? "(none)" : String(s).length > 6 ? String(s).slice(0, 3) + "***" + String(s).slice(-4) : "***")
    banner("RUN CONFIGURATION")
    console.log(`  Job URL        : ${jobUrl}`)
    console.log(`  Mode           : ${DRY ? "DRY RUN — fills and audits, does NOT click submit" : "*** LIVE — WILL CLICK SUBMIT ***"}`)
    console.log(`  Candidate      : ${userData.name} <${mask(userData.email)}>`)
    console.log(`  Phone          : ${userData.countryCode} ${mask(userData.phone)}`)
    console.log(`  Location       : ${userData.location}`)
    console.log(`  LinkedIn       : ${userData.linkedinUrl ? "yes" : "no"}   GitHub: ${userData.githubUrl ? "yes" : "no"}`)
    console.log(`  Résumé         : ${resumeUrl ? p.resume_url : "(none)"}`)
    console.log(`  Skills         : ${(userData.skills || []).join(", ") || "(none)"}`)
    console.log(`  Cover letter   : ${(userData.coverLetter || "").length} chars on file`)
    console.log(`  Experience     : ${(p.experience || []).length} role(s)   Education: ${(p.education || []).length}`)
    console.log(`  LLM providers  : ${[env.OPENROUTER_API_KEY && "OpenRouter", env.GEMINI_API_KEY && "Gemini", env.OPENAI_API_KEY && "OpenAI"].filter(Boolean).join(" → ")}`)

    // ─── run ───
    const { fillJobApplicationWithKernel } = await import("@/lib/kernel")

    banner("LIVE RUN LOG")
    const t0 = Date.now()
    const steps: any[] = []
    const result = await fillJobApplicationWithKernel(
      jobUrl,
      userData,
      (s: any) => {
        steps.push(s)
        const t = ((Date.now() - t0) / 1000).toFixed(1).padStart(6)
        if (s.log) console.log(`[${t}s] STEP ${s.status ? `(${s.status}) ` : ""}${s.log}`)
        if (s.error) console.log(`[${t}s] STEP ERROR ${s.error}`)
      },
      // A synthetic id: it makes every `if (applicationId)` log fire (and therefore
      // reach the console mirror) while the Supabase writes it triggers hit no real
      // row and are swallowed. Nothing in the production queue is touched.
      `e2e-${Date.now()}`,
      undefined // no userId → no profile pool, no answer bank writes
    )

    banner("RESULT")
    console.log(JSON.stringify(result, null, 2))
    console.log(`\n  Wall clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  })
})

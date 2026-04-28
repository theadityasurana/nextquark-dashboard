import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { parseJobContent, normalizeExperienceLevel, normalizeJobType } from "@/lib/job-parser"
import { htmlToMarkdown } from "@/lib/html-converter"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    const body = await request.json().catch(() => ({}))
    const { dryRun } = body

    // Fetch all jobs
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("id, title, type, experience, salary_range, description, detailed_requirements, requirements, skills, benefits, education_level, work_authorization")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "No jobs found", updated: 0 })
    }

    console.log(`Backfill: processing ${jobs.length} jobs`)

    let updated = 0
    let skipped = 0
    const changes: any[] = []

    for (const job of jobs) {
      const updates: Record<string, any> = {}
      let changed = false

      // 1. Re-normalize type
      const normalizedType = normalizeJobType(job.type)
      if (normalizedType !== job.type) {
        updates.type = normalizedType
        changed = true
      }

      // 2. Re-parse experience from title using updated extractLevelFromTitle
      // Parse the description to get the full extraction
      const content = job.detailed_requirements || job.description || ""
      const parsed = parseJobContent(content, job.title)
      const newExperience = normalizeExperienceLevel(parsed.experienceLevel || job.experience)
      if (newExperience !== job.experience) {
        updates.experience = newExperience
        changed = true
      }

      // 3. Fix salary_range default
      if (job.salary_range === "Not specified") {
        // Try to re-extract salary from content
        if (parsed.salaryMin && parsed.salaryMax) {
          updates.salary_range = `$${Number(parsed.salaryMin).toLocaleString()} - $${Number(parsed.salaryMax).toLocaleString()}`
        } else {
          updates.salary_range = "Competitive salary"
        }
        changed = true
      }

      // 4. Backfill work_authorization if missing
      if (!job.work_authorization && parsed.workAuthorization) {
        updates.work_authorization = parsed.workAuthorization
        changed = true
      }

      // 5. Backfill skills if empty
      if ((!job.skills || job.skills.length === 0) && parsed.skills.length > 0) {
        updates.skills = parsed.skills
        changed = true
      }

      // 6. Backfill requirements if empty
      if ((!job.requirements || job.requirements.length === 0) && parsed.requirements.length > 0) {
        updates.requirements = parsed.requirements
        changed = true
      }

      // 7. Backfill benefits if empty
      if ((!job.benefits || job.benefits.length === 0) && parsed.benefits.length > 0) {
        updates.benefits = parsed.benefits
        changed = true
      }

      if (!changed) {
        skipped++
        continue
      }

      if (dryRun) {
        changes.push({
          id: job.id,
          title: job.title,
          changes: Object.entries(updates).map(([key, val]) => ({
            field: key,
            from: (job as any)[key],
            to: val,
          })),
        })
        updated++
        continue
      }

      const { error: updateError } = await supabase
        .from("jobs")
        .update(updates)
        .eq("id", job.id)

      if (updateError) {
        console.error(`Backfill error for job ${job.id}:`, updateError)
      } else {
        updated++
      }
    }

    console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}`)

    return NextResponse.json({
      total: jobs.length,
      updated,
      skipped,
      ...(dryRun ? { dryRun: true, changes } : {}),
      message: dryRun
        ? `Dry run: ${updated} jobs would be updated, ${skipped} unchanged`
        : `Backfill complete: ${updated} jobs updated, ${skipped} unchanged`,
    })
  } catch (error) {
    console.error("Backfill error:", error)
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 })
  }
}

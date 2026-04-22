import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { parseJobContent, normalizeExperienceLevel, EXPERIENCE_LEVELS } from "@/lib/job-parser"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const BATCH_SIZE = 500

export async function POST() {
  try {
    const supabase = getAdminClient()

    let updated = 0
    let skipped = 0
    let totalProcessed = 0
    let offset = 0
    const validSet = new Set<string>(EXPERIENCE_LEVELS)
    const sampleChanges: { id: string; title: string; old: string; new: string }[] = []

    while (true) {
      // Paginate through all jobs
      const { data: jobs, error } = await supabase
        .from("jobs")
        .select("id, title, experience, description, detailed_requirements")
        .range(offset, offset + BATCH_SIZE - 1)

      if (error) {
        return NextResponse.json({ error: error.message, updatedSoFar: updated }, { status: 500 })
      }

      if (!jobs || jobs.length === 0) break

      for (const job of jobs) {
        totalProcessed++

        // Skip if already valid
        if (validSet.has(job.experience)) {
          skipped++
          continue
        }

        // Re-parse from description/detailed_requirements for best accuracy
        let newLevel: string | null = null
        const content = job.detailed_requirements || job.description || ""
        if (content) {
          const parsed = parseJobContent(content, job.title)
          if (parsed.experienceLevel) {
            newLevel = normalizeExperienceLevel(parsed.experienceLevel)
          }
        }

        // If parsing didn't yield a result, fall back to old experience value + title
        if (!newLevel) {
          newLevel = classifyFromTitleAndOldValue(job.title, job.experience)
        }

        const { error: updateError } = await supabase
          .from("jobs")
          .update({ experience: newLevel })
          .eq("id", job.id)

        if (!updateError) {
          updated++
          if (sampleChanges.length < 50) {
            sampleChanges.push({ id: job.id, title: job.title, old: job.experience || "", new: newLevel })
          }
        }
      }

      // If we got fewer than BATCH_SIZE, we've reached the end
      if (jobs.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }

    return NextResponse.json({
      totalProcessed,
      alreadyValid: skipped,
      updated,
      sampleChanges,
    })
  } catch (error) {
    console.error("Reclassify error:", error)
    return NextResponse.json({ error: "Reclassification failed" }, { status: 500 })
  }
}

function classifyFromTitleAndOldValue(title: string | null, oldExperience: string | null): string {
  // First try the old experience value
  const fromOld = normalizeExperienceLevel(oldExperience)
  if (fromOld !== "Entry Level" || !title) return fromOld

  // If old value was empty/generic, infer from title
  const t = (title || "").toLowerCase()
  if (/\bc[\s-]?level\b|\bchief\b|\bceo\b|\bcto\b|\bcfo\b|\bcoo\b/.test(t)) return "C-Level"
  if (/\bvp\b|\bvice\s+president\b/.test(t)) return "VP"
  if (/\bdirector\b/.test(t)) return "Director"
  if (/\bprincipal\b|\bstaff\b|\bdistinguished\b/.test(t)) return "Principal"
  if (/\blead\b|\bhead\s+of\b|\bmanager\b/.test(t)) return "Lead"
  if (/\bsenior\b|\bsr\.?\b/.test(t)) return "Senior Level"
  if (/\bjunior\b|\bjr\.?\b/.test(t)) return "Middle Level"
  if (/\bmid[\s-]?level\b/.test(t)) return "Middle Level"
  if (/\bintern(?:ship)?\b|\bco[\s-]?op\b/.test(t)) return "Internship"
  if (/\bentry\b/.test(t)) return "Entry Level"

  return "Entry Level"
}

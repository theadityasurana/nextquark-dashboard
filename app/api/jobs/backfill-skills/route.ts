import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { extractSkills } from "@/lib/job-parser"

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
    const sampleChanges: { id: string; title: string; skills: string[] }[] = []

    while (true) {
      const { data: jobs, error } = await supabase
        .from("jobs")
        .select("id, title, skills, description, detailed_requirements")
        .range(offset, offset + BATCH_SIZE - 1)

      if (error) {
        return NextResponse.json({ error: error.message, updatedSoFar: updated }, { status: 500 })
      }

      if (!jobs || jobs.length === 0) break

      for (const job of jobs) {
        totalProcessed++

        // Skip if already has skills
        if (job.skills && Array.isArray(job.skills) && job.skills.length > 0) {
          skipped++
          continue
        }

        // Build text to scan: detailed_requirements + description + title
        const text = [
          job.detailed_requirements || "",
          job.description || "",
          job.title || "",
        ].join(" ")
          .replace(/<[^>]*>/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .toLowerCase()
          .trim()

        const skills = extractSkills(text)

        if (skills.length === 0) continue

        const { error: updateError } = await supabase
          .from("jobs")
          .update({ skills })
          .eq("id", job.id)

        if (!updateError) {
          updated++
          if (sampleChanges.length < 50) {
            sampleChanges.push({ id: job.id, title: job.title, skills })
          }
        }
      }

      if (jobs.length < BATCH_SIZE) break
      offset += BATCH_SIZE
    }

    return NextResponse.json({
      totalProcessed,
      alreadyHadSkills: skipped,
      updated,
      sampleChanges,
    })
  } catch (error) {
    console.error("Backfill skills error:", error)
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 })
  }
}

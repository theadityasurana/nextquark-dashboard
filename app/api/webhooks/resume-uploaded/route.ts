import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseResume } from "@/lib/resume-parser"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { table, record, old_record } = payload

    if (table !== "profiles") {
      return NextResponse.json({ skipped: true, reason: "not profiles table" })
    }

    const resumeUrl = record?.resume_url
    const oldResumeUrl = old_record?.resume_url
    const userId = record?.id

    if (!resumeUrl || !userId || resumeUrl === oldResumeUrl) {
      return NextResponse.json({ skipped: true, reason: "no resume change" })
    }

    console.log(`[Resume Parser] Processing resume for user ${userId}: ${resumeUrl}`)

    const supabase = getAdminClient()

    // Build the full storage URL
    const storageUrl = resumeUrl.startsWith("http")
      ? resumeUrl
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/resumes/${userId}/${resumeUrl}`

    // Download the resume PDF
    const response = await fetch(storageUrl)
    if (!response.ok) {
      console.error(`[Resume Parser] Failed to download resume: ${response.status}`)
      return NextResponse.json({ error: "Failed to download resume" }, { status: 500 })
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer())
    const parsed = await parseResume(pdfBuffer)

    console.log(`[Resume Parser] Parsed resume for ${parsed.full_name || userId}`)

    // Fetch current profile to only fill empty fields
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()

    const updateData: Record<string, any> = {}

    const setIfEmpty = (dbField: string, parsedValue: any) => {
      if (parsedValue == null) return
      if (Array.isArray(parsedValue) && parsedValue.length === 0) return
      const current = currentProfile?.[dbField]
      const isEmpty =
        current == null ||
        current === "" ||
        (Array.isArray(current) && current.length === 0) ||
        (typeof current === "object" && !Array.isArray(current) && Object.keys(current).length === 0)
      if (isEmpty) updateData[dbField] = parsedValue
    }

    setIfEmpty("name", parsed.full_name)
    setIfEmpty("first_name", parsed.first_name)
    setIfEmpty("last_name", parsed.last_name)
    setIfEmpty("gender", parsed.gender)
    setIfEmpty("phone", parsed.phone)
    setIfEmpty("country_code", parsed.country_code)
    setIfEmpty("location", parsed.location)
    setIfEmpty("headline", parsed.headline)
    setIfEmpty("bio", parsed.bio)
    setIfEmpty("linkedin_url", parsed.linkedin_url)
    setIfEmpty("github_url", parsed.github_url)
    setIfEmpty("skills", parsed.skills)
    setIfEmpty("top_skills", parsed.top_skills)
    setIfEmpty("experience", parsed.experience)
    setIfEmpty("education", parsed.education)
    setIfEmpty("certifications", parsed.certifications)
    setIfEmpty("achievements", parsed.achievements)

    if (Object.keys(updateData).length === 0) {
      console.log("[Resume Parser] All fields already populated, nothing to update")
      return NextResponse.json({ success: true, updated: false, reason: "all fields already filled" })
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", userId)

    if (updateError) {
      console.error("[Resume Parser] Update error:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const updatedFields = Object.keys(updateData)
    console.log(`[Resume Parser] Updated ${updatedFields.length} fields for user ${userId}:`, updatedFields)

    return NextResponse.json({ success: true, updated: true, fields: updatedFields, user_id: userId })
  } catch (error: any) {
    console.error("[Resume Parser] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

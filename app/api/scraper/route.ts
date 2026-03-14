import { NextRequest, NextResponse } from "next/server"
import { scrapeJobsWithSkyvern } from "@/lib/skyvern"
import { htmlToMarkdown } from "@/lib/html-converter"

export async function POST(request: NextRequest) {
  try {
    const { portalUrl } = await request.json()

    if (!portalUrl) {
      return NextResponse.json({ error: "Portal URL is required" }, { status: 400 })
    }

    if (!process.env.SKYVERN_API_KEY) {
      return NextResponse.json({ error: "SKYVERN_API_KEY not configured" }, { status: 500 })
    }

    console.log("Starting Skyvern scrape for:", portalUrl)
    const rawJobs = await scrapeJobsWithSkyvern(portalUrl)
    const jobs = rawJobs.map(formatScrapedJob).filter((job) => job.title)
    console.log("Scraping completed. Found jobs:", jobs.length)

    return NextResponse.json({ jobs, success: true })
  } catch (error) {
    console.error("Scraper error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Scraping failed",
        jobs: [],
      },
      { status: 500 }
    )
  }
}

function stripHtmlTags(html: string): string {
  if (!html) return ""
  return html
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<style[^>]*>.*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function formatScrapedJob(job: any) {
  const cleanTitle = stripHtmlTags(job.title || "")
  const cleanLocation = stripHtmlTags(job.location || "Not specified")
  const cleanType = stripHtmlTags(job.type || "Full-time")
  const cleanExperience = stripHtmlTags(job.experience || "Not specified")
  const plainDescription = stripHtmlTags(job.description || "")
  const shortDesc = plainDescription ? plainDescription.substring(0, 500) : ""
  const detailedHtml = job.detailedRequirements || job.description || ""
  const markdownDetailedReqs = htmlToMarkdown(detailedHtml)

  return {
    title: cleanTitle.trim(),
    location: cleanLocation.trim(),
    type: cleanType.trim(),
    experience: cleanExperience.trim(),
    salaryMin: job.salaryMin || "",
    salaryMax: job.salaryMax || "",
    description: shortDesc.trim(),
    requirements: Array.isArray(job.requirements) ? job.requirements.map((r: string) => stripHtmlTags(r)) : [],
    skills: Array.isArray(job.skills) ? job.skills.map((s: string) => stripHtmlTags(s)) : [],
    benefits: Array.isArray(job.benefits) ? job.benefits.map((b: string) => stripHtmlTags(b)) : [],
    detailedRequirements: markdownDetailedReqs.trim(),
    jobUrl: (job.jobUrl || "").trim(),
  }
}

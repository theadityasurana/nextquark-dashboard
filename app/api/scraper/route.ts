import { NextRequest, NextResponse } from "next/server"
import { BrowserUse } from "browser-use-sdk"

export async function POST(request: NextRequest) {
  try {
    const { portalUrl } = await request.json()

    if (!portalUrl) {
      return NextResponse.json({ error: "Portal URL is required" }, { status: 400 })
    }

    if (!process.env.BROWSER_USE_API_KEY) {
      return NextResponse.json({ error: "BROWSER_USE_API_KEY not configured" }, { status: 500 })
    }

    const jobs = await scrapeWithBrowserUse(portalUrl)
    return NextResponse.json({ jobs })
  } catch (error) {
    console.error("Scraper error:", error)
    return NextResponse.json({ error: "Scraping failed", jobs: [] }, { status: 500 })
  }
}

async function scrapeWithBrowserUse(portalUrl: string) {
  try {
    const apiKey = process.env.BROWSER_USE_API_KEY
    if (!apiKey) return []

    const client = new BrowserUse({ apiKey })
    const goal = `Navigate to ${portalUrl} and extract all job listings. Return ONLY valid JSON array with objects: {title, location, type, experience, salaryMin, salaryMax, description, jobUrl}`

    const steps: any[] = []
    for await (const step of client.run(goal)) {
      steps.push(step)
    }

    if (steps.length === 0) return []

    const lastStep = steps[steps.length - 1]
    
    if (!lastStep.actions || lastStep.actions.length === 0) return []

    try {
      const actionStr = lastStep.actions[0]
      const actionObj = JSON.parse(actionStr)
      
      if (actionObj.done && actionObj.done.text) {
        let jsonText = actionObj.done.text
        jsonText = jsonText.replace(/\\\"/g, '"').replace(/\\\\/g, '\\')
        const parsed = JSON.parse(jsonText)
        
        if (Array.isArray(parsed)) {
          return parsed.map(formatScrapedJob).filter(job => job.title)
        }
      }
    } catch (e) {
      console.error("Failed to parse Browser Use actions:", e)
    }

    return []
  } catch (error) {
    console.error("Browser Use scraper error:", error)
    return []
  }
}

function formatScrapedJob(job: any) {
  return {
    title: (job.title || "").trim(),
    location: (job.location || "Not specified").trim(),
    type: (job.type || "Full-time").trim(),
    experience: (job.experience || "Not specified").trim(),
    salaryMin: job.salaryMin || "",
    salaryMax: job.salaryMax || "",
    description: (job.description || "").trim(),
    requirements: Array.isArray(job.requirements) ? job.requirements : [],
    skills: Array.isArray(job.skills) ? job.skills : [],
    benefits: Array.isArray(job.benefits) ? job.benefits : [],
    detailedRequirements: (job.detailedRequirements || job.description || "").trim(),
    jobUrl: (job.jobUrl || "").trim(),
  }
}

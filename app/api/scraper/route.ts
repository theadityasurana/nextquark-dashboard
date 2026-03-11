import { NextRequest, NextResponse } from "next/server"
import { BrowserUse } from "browser-use-sdk"
import { htmlToMarkdown } from "@/lib/html-converter"

export async function POST(request: NextRequest) {
  try {
    const { portalUrl } = await request.json()

    if (!portalUrl) {
      return NextResponse.json({ error: "Portal URL is required" }, { status: 400 })
    }

    if (!process.env.BROWSER_USE_API_KEY) {
      return NextResponse.json({ error: "BROWSER_USE_API_KEY not configured" }, { status: 500 })
    }

    console.log("Starting scrape for:", portalUrl)
    const jobs = await scrapeWithBrowserUse(portalUrl)
    console.log("Scraping completed. Found jobs:", jobs.length)
    
    // Always return jobs array, even if empty
    return NextResponse.json({ jobs, success: true })
  } catch (error) {
    console.error("Scraper error:", error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Scraping failed", 
      jobs: [] 
    }, { status: 500 })
  }
}

async function scrapeWithBrowserUse(portalUrl: string) {
  try {
    const apiKey = process.env.BROWSER_USE_API_KEY
    if (!apiKey) return []

    const client = new BrowserUse({ apiKey })
    const goal = `Navigate to ${portalUrl} and extract all job listings with COMPLETE details. For each job, extract:
- title: Job title
- location: Job location
- type: Employment type (Full-time, Part-time, etc.)
- experience: Required experience level
- salaryMin: Minimum salary (if available)
- salaryMax: Maximum salary (if available)
- description: Brief job summary (1-2 sentences)
- detailedRequirements: FULL detailed job description including all requirements, responsibilities, qualifications, and any other details
- jobUrl: Direct URL to the job posting
- requirements: Array of key requirements
- skills: Array of required skills
- benefits: Array of benefits offered

Return ONLY valid JSON array with these objects. Make sure to extract the COMPLETE job description for detailedRequirements field.`

    const steps: any[] = []
    for await (const step of client.run(goal)) {
      console.log("Browser Use step:", JSON.stringify(step, null, 2))
      steps.push(step)
    }

    if (steps.length === 0) {
      console.error("No steps returned from Browser Use")
      return []
    }

    const lastStep = steps[steps.length - 1]
    console.log("Last step:", JSON.stringify(lastStep, null, 2))
    console.log("Last step keys:", Object.keys(lastStep))
    
    // Try multiple ways to extract the data
    // Method 1: Check if result is directly in the step
    if (lastStep.result) {
      try {
        const parsed = typeof lastStep.result === 'string' ? JSON.parse(lastStep.result) : lastStep.result
        if (Array.isArray(parsed)) {
          console.log("Found jobs in lastStep.result:", parsed.length)
          return parsed.map(formatScrapedJob).filter(job => job.title)
        }
      } catch (e) {
        console.error("Failed to parse lastStep.result:", e)
      }
    }

    // Method 2: Check actions array
    if (lastStep.actions && lastStep.actions.length > 0) {
      try {
        console.log("Checking actions array:", lastStep.actions)
        const actionStr = typeof lastStep.actions[0] === 'string' ? lastStep.actions[0] : JSON.stringify(lastStep.actions[0])
        const actionObj = JSON.parse(actionStr)
        console.log("Parsed action object:", actionObj)
        
        if (actionObj.done && actionObj.done.text) {
          let jsonText = actionObj.done.text
          console.log("Raw done.text:", jsonText)
          jsonText = jsonText.replace(/\\\"/g, '"').replace(/\\\\/g, '\\')
          const parsed = JSON.parse(jsonText)
          
          if (Array.isArray(parsed)) {
            console.log("Found jobs in actions[0].done.text:", parsed.length)
            return parsed.map(formatScrapedJob).filter(job => job.title)
          }
        }
      } catch (e) {
        console.error("Failed to parse Browser Use actions:", e)
      }
    }

    // Method 3: Check if there's a message or output field
    if (lastStep.message || lastStep.output) {
      try {
        const text = lastStep.message || lastStep.output
        const parsed = typeof text === 'string' ? JSON.parse(text) : text
        if (Array.isArray(parsed)) {
          console.log("Found jobs in message/output:", parsed.length)
          return parsed.map(formatScrapedJob).filter(job => job.title)
        }
      } catch (e) {
        console.error("Failed to parse message/output:", e)
      }
    }

    // Method 4: Try to find any array in the response
    console.log("Attempting to find jobs in entire lastStep object...")
    const findArrayInObject = (obj: any): any[] => {
      if (Array.isArray(obj)) return obj
      if (typeof obj === 'object' && obj !== null) {
        for (const key of Object.keys(obj)) {
          const result = findArrayInObject(obj[key])
          if (result.length > 0) return result
        }
      }
      return []
    }
    
    const foundArray = findArrayInObject(lastStep)
    if (foundArray.length > 0 && foundArray[0]?.title) {
      console.log("Found jobs array in nested object:", foundArray.length)
      return foundArray.map(formatScrapedJob).filter(job => job.title)
    }

    console.error("Could not extract jobs from Browser Use response")
    return []
  } catch (error) {
    console.error("Browser Use scraper error:", error)
    return []
  }
}

function decodeHtmlEntities(text: string): string {
  if (!text) return ""
  
  let decoded = text
  // Decode multiple times to handle double/triple encoding
  for (let i = 0; i < 3; i++) {
    const temp = decoded
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/")
    if (temp === decoded) break
    decoded = temp
  }
  
  return decoded
}

function sanitizeHtml(html: string): string {
  if (!html) return ""
  
  // First decode HTML entities
  const decoded = decodeHtmlEntities(html)
  
  // Remove dangerous tags but keep formatting tags
  const sanitized = decoded
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<style[^>]*>.*?<\/style>/gi, "")
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "") // Remove inline event handlers
    .replace(/on\w+='[^']*'/gi, "")
    .trim()
  
  return sanitized
}

function stripHtmlTags(html: string): string {
  if (!html) return ""
  
  // First decode and sanitize
  const sanitized = sanitizeHtml(html)
  
  // Remove all HTML tags for plain text
  const stripped = sanitized
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  
  return stripped
}

function formatScrapedJob(job: any) {
  // For title, location, type, experience - strip HTML completely
  const cleanTitle = stripHtmlTags(job.title || "")
  const cleanLocation = stripHtmlTags(job.location || "Not specified")
  const cleanType = stripHtmlTags(job.type || "Full-time")
  const cleanExperience = stripHtmlTags(job.experience || "Not specified")
  
  // For descriptions - sanitize HTML first
  const htmlDescription = sanitizeHtml(job.description || "")
  const htmlDetailedReqs = sanitizeHtml(job.detailedRequirements || job.description || "")
  
  // Create plain text version for brief description
  const plainDescription = stripHtmlTags(job.description || "")
  const shortDesc = plainDescription ? plainDescription.substring(0, 500) : ""
  
  // Convert HTML to Markdown for cross-platform compatibility
  const markdownDetailedReqs = htmlToMarkdown(htmlDetailedReqs || htmlDescription)
  
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

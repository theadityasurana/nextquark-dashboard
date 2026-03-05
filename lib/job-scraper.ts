export interface ScrapedJob {
  title: string
  location: string
  type: string
  experience: string
  salaryMin: string
  salaryMax: string
  description: string
  requirements: string[]
  skills: string[]
  benefits: string[]
  detailedRequirements: string
  jobUrl: string
}

export async function scrapeJobPortal(portalUrl: string): Promise<ScrapedJob[]> {
  try {
    const response = await fetch("/api/scraper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portalUrl }),
    })

    if (!response.ok) {
      throw new Error("Failed to scrape portal")
    }

    const data = await response.json()
    return data.jobs || []
  } catch (error) {
    console.error("Error scraping job portal:", error)
    return []
  }
}

export function parseJobDetails(html: string): Partial<ScrapedJob> {
  const parsed: Partial<ScrapedJob> = {
    requirements: [],
    skills: [],
    benefits: [],
  }

  // Extract title
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/) || html.match(/<title[^>]*>([^<]+)<\/title>/)
  if (titleMatch) parsed.title = titleMatch[1].trim()

  // Extract location
  const locationMatch = html.match(/location[^>]*>([^<]+)<|Location[^>]*>([^<]+)</i)
  if (locationMatch) parsed.location = (locationMatch[1] || locationMatch[2]).trim()

  // Extract salary
  const salaryMatch = html.match(/\$[\d,]+\s*-\s*\$[\d,]+|\$[\d,]+/)
  if (salaryMatch) {
    const salaries = salaryMatch[0].match(/\d+/g)
    if (salaries && salaries.length >= 2) {
      parsed.salaryMin = salaries[0]
      parsed.salaryMax = salaries[1]
    }
  }

  // Extract job type
  const typeMatch = html.match(/(Full-time|Part-time|Contract|Internship|Freelance)/i)
  if (typeMatch) parsed.type = typeMatch[1]

  // Extract description
  const descMatch = html.match(/<div[^>]*class="[^"]*description[^"]*"[^>]*>([^<]+)</i)
  if (descMatch) parsed.description = descMatch[1].trim()

  return parsed
}

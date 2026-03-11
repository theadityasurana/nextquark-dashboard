import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { htmlToMarkdown } from "@/lib/html-converter"
import { parseJobContent } from "@/lib/job-parser"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ATS API endpoints
const ATS_APIS = {
  greenhouse: (companyId: string) => `https://boards-api.greenhouse.io/v1/boards/${companyId}/jobs?content=true`,
  lever: (companyId: string) => `https://api.lever.co/v0/postings/${companyId}?mode=json`,
  ashby: (companyId: string) => `https://api.ashbyhq.com/posting-api/job-board/${companyId}`,
}

async function fetchGreenhouseJobs(companyId: string) {
  const url = ATS_APIS.greenhouse(companyId)
  console.log('Fetching from Greenhouse:', url)
  const response = await fetch(url)
  console.log('Greenhouse response status:', response.status)
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Greenhouse API error:', errorText)
    throw new Error(`Greenhouse API returned ${response.status}: ${errorText}`)
  }
  const data = await response.json()
  console.log('Greenhouse data:', JSON.stringify(data).substring(0, 200))
  const jobs = data.jobs || []
  console.log('Found jobs:', jobs.length)
  
  return jobs.map((job: any) => {
    // Extract location from location object or offices array
    let location = "Remote"
    if (job.location?.name) {
      location = job.location.name
    } else if (job.offices && job.offices.length > 0) {
      location = job.offices.map((o: any) => o.name).join(", ")
    }

    // Extract departments
    const departments = job.departments?.map((d: any) => d.name).join(", ") || ""

    // Parse content for description and requirements
    let description = ""
    let detailedRequirements = ""
    let requirements: string[] = []
    let skills: string[] = []
    let benefits: string[] = []
    let jobType = "Full-time"
    let experienceLevel = ""
    let salaryMin = ""
    let salaryMax = ""
    let educationLevel = null
    let workAuthorization = null
    
    if (job.content) {
      // Decode HTML entities (handles double encoding)
      let decodedContent = job.content
      // Decode multiple times to handle double/triple encoding
      for (let i = 0; i < 3; i++) {
        const temp = decodedContent
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ")
        if (temp === decodedContent) break
        decodedContent = temp
      }
      
      // Sanitize HTML - remove dangerous tags but keep formatting
      const sanitizedHtml = decodedContent
        .replace(/<script[^>]*>.*?<\/script>/gi, "")
        .replace(/<style[^>]*>.*?<\/style>/gi, "")
        .replace(/<iframe[^>]*>.*?<\/iframe>/gi, "")
        .replace(/on\w+="[^"]*"/gi, "") // Remove inline event handlers
        .replace(/on\w+='[^']*'/gi, "")
        .trim()
      
      // Parse structured data from content
      const parsed = parseJobContent(sanitizedHtml)
      requirements = parsed.requirements
      skills = parsed.skills
      benefits = parsed.benefits
      jobType = parsed.jobType || "Full-time"
      experienceLevel = parsed.experienceLevel || ""
      salaryMin = parsed.salaryMin || ""
      salaryMax = parsed.salaryMax || ""
      educationLevel = parsed.educationLevel || null
      workAuthorization = parsed.workAuthorization || null
      
      // For brief description, strip HTML tags
      const plainText = sanitizedHtml
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      
      description = plainText.substring(0, 500)
      // Convert HTML to Markdown for cross-platform compatibility
      detailedRequirements = htmlToMarkdown(sanitizedHtml)
    }

    // Extract metadata
    const metadata = job.metadata || []
    
    // Format salary range
    let salaryRange = "Not specified"
    if (salaryMin && salaryMax) {
      salaryRange = `$${Number(salaryMin).toLocaleString()} - $${Number(salaryMax).toLocaleString()}`
    } else if (salaryMin) {
      salaryRange = `$${Number(salaryMin).toLocaleString()}+`
    }
    
    return {
      title: job.title || "Untitled Position",
      location,
      jobUrl: job.absolute_url || "",
      description,
      detailedRequirements,
      type: jobType,
      experience: experienceLevel,
      salaryRange,
      requirements,
      skills,
      benefits,
      departments,
      educationLevel,
      workAuthorization,
      updatedAt: job.updated_at || new Date().toISOString(),
    }
  })
}

async function fetchLeverJobs(companyId: string) {
  const url = ATS_APIS.lever(companyId)
  console.log('Fetching from Lever:', url)
  const response = await fetch(url)
  console.log('Lever response status:', response.status)
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Lever API error:', errorText)
    throw new Error(`Lever API returned ${response.status}: ${errorText}`)
  }
  const data = await response.json()
  console.log('Lever data:', JSON.stringify(data).substring(0, 200))
  console.log('Found jobs:', data?.length || 0)
  
  return (data || []).map((job: any) => {
    console.log('Processing Lever job:', job.text, '- Has description:', !!job.description)
    let description = ""
    let detailedRequirements = ""
    let requirements: string[] = []
    let skills: string[] = []
    let benefits: string[] = []
    let jobType = "Full-time"
    let experienceLevel = ""
    let salaryMin = ""
    let salaryMax = ""
    let educationLevel = null
    let workAuthorization = null
    
    if (job.description) {
      // Decode HTML entities (handles double encoding) - same as Greenhouse
      let decodedContent = job.description
      for (let i = 0; i < 3; i++) {
        const temp = decodedContent
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ")
        if (temp === decodedContent) break
        decodedContent = temp
      }
      
      // Sanitize HTML - remove dangerous tags but keep formatting
      const sanitizedHtml = decodedContent
        .replace(/<script[^>]*>.*?<\/script>/gi, "")
        .replace(/<style[^>]*>.*?<\/style>/gi, "")
        .replace(/<iframe[^>]*>.*?<\/iframe>/gi, "")
        .replace(/on\w+="[^"]*"/gi, "") // Remove inline event handlers
        .replace(/on\w+='[^']*'/gi, "")
        .trim()
      
      // Parse structured data from Lever description
      const parsed = parseJobContent(sanitizedHtml)
      requirements = parsed.requirements
      skills = parsed.skills
      benefits = parsed.benefits
      jobType = parsed.jobType || job.categories?.commitment || "Full-time"
      experienceLevel = parsed.experienceLevel || ""
      salaryMin = parsed.salaryMin || ""
      salaryMax = parsed.salaryMax || ""
      educationLevel = parsed.educationLevel || null
      workAuthorization = parsed.workAuthorization || null
      
      // Strip HTML for brief description
      const plainText = sanitizedHtml
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      
      description = plainText.substring(0, 500)
      detailedRequirements = htmlToMarkdown(sanitizedHtml)
    }
    
    // Format salary range
    let salaryRange = "Not specified"
    if (salaryMin && salaryMax) {
      salaryRange = `$${Number(salaryMin).toLocaleString()} - $${Number(salaryMax).toLocaleString()}`
    } else if (salaryMin) {
      salaryRange = `$${Number(salaryMin).toLocaleString()}+`
    }
    
    const result = {
      title: job.text,
      location: job.categories?.location || "Remote",
      jobUrl: job.hostedUrl,
      description,
      detailedRequirements,
      type: jobType,
      experience: experienceLevel,
      salaryRange,
      requirements,
      skills,
      benefits,
      departments: job.categories?.team || "",
      educationLevel,
      workAuthorization,
      updatedAt: job.createdAt || new Date().toISOString(),
    }
    
    console.log('Lever job parsed:', {
      title: result.title,
      hasDescription: !!result.description,
      hasDetailedReqs: !!result.detailedRequirements,
      requirementsCount: result.requirements.length,
      skillsCount: result.skills.length,
      experience: result.experience,
      salary: result.salaryRange
    })
    
    return result
  })
}

async function fetchAshbyJobs(companyId: string) {
  const url = ATS_APIS.ashby(companyId)
  console.log('Fetching from Ashby:', url)
  const response = await fetch(url)
  console.log('Ashby response status:', response.status)
  if (!response.ok) {
    const errorText = await response.text()
    console.error('Ashby API error:', errorText)
    throw new Error(`Ashby API returned ${response.status}: ${errorText}`)
  }
  const data = await response.json()
  console.log('Ashby raw response keys:', Object.keys(data))
  console.log('Ashby data sample:', JSON.stringify(data).substring(0, 500))
  
  // Ashby might return jobs in different structures
  const jobsList = data.jobs || data.postings || data.results || []
  console.log('Found jobs:', jobsList.length)
  
  if (jobsList.length > 0) {
    console.log('First job keys:', Object.keys(jobsList[0]))
    console.log('First job sample:', JSON.stringify(jobsList[0]).substring(0, 300))
  }
  
  return jobsList.map((job: any) => {
    // Ashby might use different field names - check multiple possibilities
    const jobTitle = job.title || job.name || job.position || "Untitled Position"
    const jobLocation = job.location || job.locationName || job.office || "Remote"
    const jobUrl = job.jobUrl || job.applyUrl || job.url || job.link || ""
    const descriptionContent = job.description || job.descriptionHtml || job.descriptionPlain || job.info?.description || ""
    
    console.log('Processing Ashby job:', jobTitle, '- Description length:', descriptionContent.length)
    
    let description = ""
    let detailedRequirements = ""
    let requirements: string[] = []
    let skills: string[] = []
    let benefits: string[] = []
    let jobType = "Full-time"
    let experienceLevel = ""
    let salaryMin = ""
    let salaryMax = ""
    let educationLevel = null
    let workAuthorization = null
    
    if (descriptionContent) {
      // Decode HTML entities (handles double encoding) - same as Greenhouse
      let decodedContent = descriptionContent
      for (let i = 0; i < 3; i++) {
        const temp = decodedContent
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ")
        if (temp === decodedContent) break
        decodedContent = temp
      }
      
      // Sanitize HTML - remove dangerous tags but keep formatting
      const sanitizedHtml = decodedContent
        .replace(/<script[^>]*>.*?<\/script>/gi, "")
        .replace(/<style[^>]*>.*?<\/style>/gi, "")
        .replace(/<iframe[^>]*>.*?<\/iframe>/gi, "")
        .replace(/on\w+="[^"]*"/gi, "") // Remove inline event handlers
        .replace(/on\w+='[^']*'/gi, "")
        .trim()
      
      // Parse structured data from Ashby description
      const parsed = parseJobContent(sanitizedHtml)
      requirements = parsed.requirements
      skills = parsed.skills
      benefits = parsed.benefits
      jobType = parsed.jobType || job.employmentType || "Full-time"
      experienceLevel = parsed.experienceLevel || ""
      salaryMin = parsed.salaryMin || ""
      salaryMax = parsed.salaryMax || ""
      educationLevel = parsed.educationLevel || null
      workAuthorization = parsed.workAuthorization || null
      
      // Strip HTML for brief description
      const plainText = sanitizedHtml
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      
      description = plainText.substring(0, 500)
      detailedRequirements = htmlToMarkdown(sanitizedHtml)
    }
    
    // Format salary range
    let salaryRange = "Not specified"
    if (salaryMin && salaryMax) {
      salaryRange = `$${Number(salaryMin).toLocaleString()} - $${Number(salaryMax).toLocaleString()}`
    } else if (salaryMin) {
      salaryRange = `$${Number(salaryMin).toLocaleString()}+`
    }
    
    const result = {
      title: jobTitle,
      location: jobLocation,
      jobUrl: jobUrl,
      description,
      detailedRequirements,
      type: jobType,
      experience: experienceLevel,
      salaryRange,
      requirements,
      skills,
      benefits,
      departments: job.department || job.team || "",
      educationLevel,
      workAuthorization,
      updatedAt: job.publishedDate || job.postedAt || job.createdAt || new Date().toISOString(),
    }
    
    console.log('Ashby job parsed:', {
      title: result.title,
      hasDescription: !!result.description,
      hasDetailedReqs: !!result.detailedRequirements,
      requirementsCount: result.requirements.length,
      skillsCount: result.skills.length,
      experience: result.experience,
      salary: result.salaryRange
    })
    
    return result
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    const body = await request.json()
    const { companyId, atsType, atsCompanyId } = body

    if (!companyId || !atsType || !atsCompanyId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    console.log('Starting ATS sync:', { companyId, atsType, atsCompanyId })
    
    // Fetch jobs from ATS API
    let jobs: any[] = []
    try {
      if (atsType === "greenhouse") {
        jobs = await fetchGreenhouseJobs(atsCompanyId)
      } else if (atsType === "lever") {
        jobs = await fetchLeverJobs(atsCompanyId)
      } else if (atsType === "ashby") {
        jobs = await fetchAshbyJobs(atsCompanyId)
      } else {
        return NextResponse.json({ error: "Invalid ATS type" }, { status: 400 })
      }
    } catch (err: any) {
      console.error(`Error fetching from ${atsType}:`, err)
      return NextResponse.json({ error: `Failed to fetch from ${atsType} API: ${err.message}` }, { status: 500 })
    }

    console.log('Total jobs fetched:', jobs.length)
    
    if (jobs.length === 0) {
      return NextResponse.json({ addedCount: 0, totalFound: 0, message: "No jobs found from ATS API" })
    }

    // Get company details
    const { data: company } = await supabase
      .from("companies")
      .select("name, logo_initial, website, linkedin_url")
      .eq("id", companyId)
      .single()

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    // Get existing jobs to avoid duplicates
    const { data: existingJobs } = await supabase
      .from("jobs")
      .select("job_url")
      .eq("company_id", companyId)

    const existingUrls = new Set(existingJobs?.map((j) => j.job_url).filter(Boolean) || [])

    let addedCount = 0

    // Insert new jobs
    for (const job of jobs) {
      if (job.jobUrl && !existingUrls.has(job.jobUrl)) {
        const jobId = `${company.logo_initial}-${String(Math.floor(Math.random() * 999)).padStart(3, "0")}`

        const { error: insertError } = await supabase.from("jobs").insert({
          id: jobId,
          company_id: companyId,
          company_name: company.name || "Unknown",
          company_initial: company.logo_initial || "?",
          title: job.title || "Untitled Position",
          location: job.location || "Remote",
          type: job.type || "Full-time",
          salary_range: job.salaryRange || "Not specified",
          experience: job.experience || "Not specified",
          portal_url: job.jobUrl || "",
          job_url: job.jobUrl || "",
          company_website: company.website || null,
          company_linkedin: company.linkedin_url || null,
          status: "queued",
          total_apps: 0,
          right_swipes: 0,
          success_rate: 0,
          avg_time: "-",
          posted_at: new Date().toISOString().split("T")[0],
          description: job.description || "",
          requirements: job.requirements || [],
          skills: job.skills || [],
          benefits: job.benefits || [],
          detailed_requirements: job.detailedRequirements || job.departments || "",
          education_level: job.educationLevel || null,
          work_authorization: job.workAuthorization || null,
        })

        if (insertError) {
          console.error('Error inserting job:', insertError)
        } else {
          console.log('Inserted job:', jobId, job.title)
          addedCount++
        }
      }
    }
    
    console.log('Sync complete. Added:', addedCount)

    return NextResponse.json({ 
      addedCount, 
      totalFound: jobs.length,
      message: `Added ${addedCount} new jobs from ${atsType}` 
    })
  } catch (error) {
    console.error("ATS sync error:", error)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}

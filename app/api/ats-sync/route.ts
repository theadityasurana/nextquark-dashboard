import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { htmlToMarkdown } from "@/lib/html-converter"
import { parseJobContent, parseSalaryFromText, mapLeverCommitment, mapAshbyEmploymentType, mapSmartRecruitersEmploymentType, normalizeExperienceLevel, normalizeJobType } from "@/lib/job-parser"

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
  smartrecruiters: (companyId: string) => `https://api.smartrecruiters.com/v1/companies/${companyId}/postings`,
}

function decodeAndSanitize(content: string): string {
  let decoded = content
  for (let i = 0; i < 3; i++) {
    const temp = decoded
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    if (temp === decoded) break
    decoded = temp
  }
  return decoded
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<style[^>]*>.*?<\/style>/gi, "")
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "")
    .trim()
}

function formatSalary(min: string, max: string): string {
  if (min && max) return `$${Number(min).toLocaleString()} - $${Number(max).toLocaleString()}`
  if (min) return `$${Number(min).toLocaleString()}+`
  return "Competitive salary"
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
  const jobs = data.jobs || []
  console.log('Greenhouse jobs found:', jobs.length, jobs[0]?.title ? `(first: ${jobs[0].title})` : '')
  
  return jobs.map((job: any) => {
    const title = job.title || "Untitled Position"

    // Extract location from location object or offices array
    let location = "Remote"
    if (job.location?.name) {
      location = job.location.name
    } else if (job.offices && job.offices.length > 0) {
      location = job.offices.map((o: any) => o.name).join(", ")
    }

    const departments = job.departments?.map((d: any) => d.name).join(", ") || ""

    let description = ""
    let detailedRequirements = ""
    let requirements: string[] = []
    let skills: string[] = []
    let benefits: string[] = []
    let jobType = ""
    let experienceLevel = ""
    let salaryMin = ""
    let salaryMax = ""
    let educationLevel = null
    let workAuthorization = null
    
    if (job.content) {
      const sanitizedHtml = decodeAndSanitize(job.content)
      
      // Pass title for title-aware extraction
      const parsed = parseJobContent(sanitizedHtml, title)
      requirements = parsed.requirements
      skills = parsed.skills
      benefits = parsed.benefits
      jobType = parsed.jobType || ""
      experienceLevel = parsed.experienceLevel || ""
      salaryMin = parsed.salaryMin || ""
      salaryMax = parsed.salaryMax || ""
      educationLevel = parsed.educationLevel || null
      workAuthorization = parsed.workAuthorization || null
      
      const plainText = sanitizedHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      description = plainText.substring(0, 500)
      detailedRequirements = htmlToMarkdown(sanitizedHtml)
    }

    // Greenhouse metadata can contain salary info
    for (const meta of (job.metadata || [])) {
      if (!salaryMin && meta.value_type === "currency_range" && meta.value) {
        salaryMin = meta.value.min_value?.toString() || ""
        salaryMax = meta.value.max_value?.toString() || ""
      }
    }
    
    return {
      title,
      location,
      jobUrl: job.absolute_url || "",
      description,
      detailedRequirements,
      type: jobType || "Full-time",
      experience: experienceLevel,
      salaryRange: formatSalary(salaryMin, salaryMax),
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
  console.log('Lever jobs found:', data?.length || 0)
  
  return (data || []).map((job: any) => {
    const title = job.text || "Untitled Position"
    const categories = job.categories || {}

    let description = ""
    let detailedRequirements = ""
    let requirements: string[] = []
    let skills: string[] = []
    let benefits: string[] = []
    let jobType = ""
    let experienceLevel = ""
    let salaryMin = ""
    let salaryMax = ""
    let educationLevel = null
    let workAuthorization = null
    
    // Combine description + lists + additional for full content parsing
    let fullHtml = ""
    if (job.description) fullHtml += job.description
    if (job.additional) fullHtml += " " + job.additional
    // Lever lists contain structured sections like "What You'll Do", "Requirements"
    if (job.lists && Array.isArray(job.lists)) {
      for (const list of job.lists) {
        fullHtml += `<h3>${list.text || ""}</h3><ul>`
        if (list.content) {
          // list.content can be string (HTML) or array
          if (typeof list.content === "string") {
            fullHtml += list.content
          } else if (Array.isArray(list.content)) {
            for (const item of list.content) {
              const c = typeof item === "string" ? item : item?.content || ""
              fullHtml += `<li>${c}</li>`
            }
          }
        }
        fullHtml += "</ul>"
      }
    }

    if (fullHtml) {
      const sanitizedHtml = decodeAndSanitize(fullHtml)
      const parsed = parseJobContent(sanitizedHtml, title)
      requirements = parsed.requirements
      skills = parsed.skills
      benefits = parsed.benefits
      jobType = parsed.jobType || ""
      experienceLevel = parsed.experienceLevel || ""
      salaryMin = parsed.salaryMin || ""
      salaryMax = parsed.salaryMax || ""
      educationLevel = parsed.educationLevel || null
      workAuthorization = parsed.workAuthorization || null
      
      const plainText = sanitizedHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      description = plainText.substring(0, 500)
      detailedRequirements = htmlToMarkdown(sanitizedHtml)
    }

    // Use Lever structured fields (higher priority than parsed)
    // Job type from categories.commitment
    const leverJobType = mapLeverCommitment(categories.commitment || "")
    if (leverJobType) jobType = leverJobType

    // Salary from additional field (Lever puts salary here, not in description)
    if (!salaryMin && job.additional) {
      const additionalSalary = parseSalaryFromText(job.additional)
      if (additionalSalary) {
        salaryMin = additionalSalary.min
        salaryMax = additionalSalary.max
      }
    }

    return {
      title,
      location: categories.location || "Remote",
      jobUrl: job.hostedUrl,
      description,
      detailedRequirements,
      type: jobType || "Full-time",
      experience: experienceLevel,
      salaryRange: formatSalary(salaryMin, salaryMax),
      requirements,
      skills,
      benefits,
      departments: categories.team || "",
      educationLevel,
      workAuthorization,
      updatedAt: job.createdAt || new Date().toISOString(),
    }
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
  
  const jobsList = data.jobs || data.postings || data.results || []
  console.log('Ashby jobs found:', jobsList.length)
  
  return jobsList.map((job: any) => {
    const title = job.title || job.name || job.position || "Untitled Position"
    const jobUrl = job.jobUrl || job.applyUrl || job.url || job.link || ""
    // Ashby provides descriptionHtml (rich) and descriptionPlain (text)
    const descriptionContent = job.descriptionHtml || job.description || job.descriptionPlain || job.info?.description || ""
    
    let description = ""
    let detailedRequirements = ""
    let requirements: string[] = []
    let skills: string[] = []
    let benefits: string[] = []
    let jobType = ""
    let experienceLevel = ""
    let salaryMin = ""
    let salaryMax = ""
    let educationLevel = null
    let workAuthorization = null
    
    if (descriptionContent) {
      const sanitizedHtml = decodeAndSanitize(descriptionContent)
      const parsed = parseJobContent(sanitizedHtml, title)
      requirements = parsed.requirements
      skills = parsed.skills
      benefits = parsed.benefits
      jobType = parsed.jobType || ""
      experienceLevel = parsed.experienceLevel || ""
      salaryMin = parsed.salaryMin || ""
      salaryMax = parsed.salaryMax || ""
      educationLevel = parsed.educationLevel || null
      workAuthorization = parsed.workAuthorization || null
      
      const plainText = sanitizedHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      description = plainText.substring(0, 500)
      detailedRequirements = htmlToMarkdown(sanitizedHtml)
    }

    // Use Ashby structured fields (higher priority)
    const ashbyJobType = mapAshbyEmploymentType(job.employmentType || "")
    if (ashbyJobType) jobType = ashbyJobType

    // Build location with remote/hybrid info
    let location = job.location || job.locationName || job.office || "Remote"
    if (job.isRemote && job.workplaceType) {
      const wt = job.workplaceType.toLowerCase()
      if (wt === "remote") location = location ? `${location} (Remote)` : "Remote"
      else if (wt === "hybrid") location = location ? `${location} (Hybrid)` : "Hybrid"
    } else if (job.isRemote) {
      location = location ? `${location} (Remote)` : "Remote"
    }

    // Ashby compensation field
    if (!salaryMin && job.compensation) {
      const comp = job.compensation
      if (comp.min && comp.max) {
        salaryMin = comp.min.toString()
        salaryMax = comp.max.toString()
      } else if (comp.range) {
        const compSalary = parseSalaryFromText(comp.range)
        if (compSalary) { salaryMin = compSalary.min; salaryMax = compSalary.max }
      }
    }

    return {
      title,
      location,
      jobUrl,
      description,
      detailedRequirements,
      type: jobType || "Full-time",
      experience: experienceLevel,
      salaryRange: formatSalary(salaryMin, salaryMax),
      requirements,
      skills,
      benefits,
      departments: job.department || job.team || "",
      educationLevel,
      workAuthorization,
      updatedAt: job.publishedDate || job.postedAt || job.createdAt || new Date().toISOString(),
    }
  })
}

async function fetchSmartRecruitersJobs(companyId: string) {
  // Step 1: Paginate through all listings (API returns max 100 per page)
  const baseUrl = ATS_APIS.smartrecruiters(companyId)
  const jobsList: any[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const url = `${baseUrl}?offset=${offset}&limit=${limit}`
    console.log('Fetching from SmartRecruiters:', url)
    const response = await fetch(url)
    console.log('SmartRecruiters response status:', response.status)
    if (!response.ok) {
      const errorText = await response.text()
      console.error('SmartRecruiters API error:', errorText)
      throw new Error(`SmartRecruiters API returned ${response.status}: ${errorText}`)
    }
    const data = await response.json()
    const page = data.content || data.postings || []
    jobsList.push(...page)

    const totalFound = data.totalFound ?? 0
    offset += page.length
    console.log(`SmartRecruiters page fetched: ${page.length} jobs (${offset}/${totalFound})`)

    if (page.length === 0 || offset >= totalFound) break
  }

  console.log('SmartRecruiters total jobs found:', jobsList.length)

  // Step 2: Fetch individual posting details in batches of 10 to avoid rate limits
  const BATCH_SIZE = 10
  const results: any[] = []

  for (let i = 0; i < jobsList.length; i += BATCH_SIZE) {
    const batch = jobsList.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (job: any) => {
      const title = job.name || job.title || "Untitled Position"
      const jobUrl = job.ref || job.applyUrl || ""

      // Location
      let location = "Remote"
      if (job.location) {
        const loc = job.location
        const parts = [loc.city, loc.region, loc.country].filter(Boolean)
        if (parts.length) location = parts.join(", ")
        if (loc.remote) location = location !== "Remote" ? `${location} (Remote)` : "Remote"
      }

      let description = ""
      let detailedRequirements = ""
      let requirements: string[] = []
      let skills: string[] = []
      let benefits: string[] = []
      let jobType = ""
      let experienceLevel = ""
      let salaryMin = ""
      let salaryMax = ""
      let educationLevel = null
      let workAuthorization = null

      // Fetch individual posting detail for full jobAd sections
      let jobDetail = job
      if (job.id) {
        try {
          const detailUrl = `https://api.smartrecruiters.com/v1/companies/${companyId}/postings/${job.id}`
          const detailRes = await fetch(detailUrl)
          if (detailRes.ok) {
            jobDetail = await detailRes.json()
          }
        } catch (err) {
          console.error(`Failed to fetch detail for job ${job.id}:`, err)
        }
      }

      // Combine all jobAd sections for full parsing
      let fullHtml = ""
      if (jobDetail.jobAd?.sections) {
        for (const section of Object.values(jobDetail.jobAd.sections) as any[]) {
          if (section?.text) fullHtml += section.text + " "
        }
      }

      if (fullHtml) {
        const sanitizedHtml = decodeAndSanitize(fullHtml)
        const parsed = parseJobContent(sanitizedHtml, title)
        requirements = parsed.requirements
        skills = parsed.skills
        benefits = parsed.benefits
        jobType = parsed.jobType || ""
        experienceLevel = parsed.experienceLevel || ""
        salaryMin = parsed.salaryMin || ""
        salaryMax = parsed.salaryMax || ""
        educationLevel = parsed.educationLevel || null
        workAuthorization = parsed.workAuthorization || null

        const plainText = sanitizedHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
        description = plainText.substring(0, 500)
        detailedRequirements = htmlToMarkdown(sanitizedHtml)
      }

      // Structured fields from SmartRecruiters (higher priority than parsed)
      const srType = jobDetail.typeOfEmployment?.label || jobDetail.typeOfEmployment
      if (typeof srType === "string" && srType) jobType = mapSmartRecruitersEmploymentType(srType)

      if (jobDetail.experienceLevel?.label) experienceLevel = jobDetail.experienceLevel.label

      // Compensation from structured field
      if (!salaryMin && jobDetail.compensation) {
        salaryMin = jobDetail.compensation.min?.value?.toString() || ""
        salaryMax = jobDetail.compensation.max?.value?.toString() || ""
      }

      return {
        title,
        location,
        jobUrl,
        description,
        detailedRequirements,
        type: jobType || "Full-time",
        experience: experienceLevel,
        salaryRange: formatSalary(salaryMin, salaryMax),
        requirements,
        skills,
        benefits,
        departments: jobDetail.department?.label || "",
        educationLevel,
        workAuthorization,
        updatedAt: jobDetail.releasedDate || jobDetail.updatedOn || new Date().toISOString(),
      }
    })
  )
  results.push(...batchResults)
  }

  return results
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    const body = await request.json()
    const { companyId, atsType, atsCompanyId: rawAtsCompanyId, preview, selectedJobUrls } = body
    const atsCompanyId = rawAtsCompanyId?.trim()

    if (!companyId || !atsType || !atsCompanyId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    console.log('Starting ATS sync:', { companyId, atsType, atsCompanyId, preview: !!preview })
    
    // Fetch jobs from ATS API
    let jobs: any[] = []
    try {
      if (atsType === "greenhouse") {
        jobs = await fetchGreenhouseJobs(atsCompanyId)
      } else if (atsType === "lever") {
        jobs = await fetchLeverJobs(atsCompanyId)
      } else if (atsType === "ashby") {
        jobs = await fetchAshbyJobs(atsCompanyId)
      } else if (atsType === "smartrecruiters") {
        jobs = await fetchSmartRecruitersJobs(atsCompanyId)
      } else {
        return NextResponse.json({ error: "Invalid ATS type" }, { status: 400 })
      }
    } catch (err: any) {
      console.error(`Error fetching from ${atsType}:`, err)
      return NextResponse.json({ error: `Failed to fetch from ${atsType} API: ${err.message}` }, { status: 500 })
    }

    console.log('Total jobs fetched:', jobs.length)

    // Preview mode: return jobs with existing/new status without saving
    if (preview) {
      const { data: existingJobs } = await supabase
        .from("jobs")
        .select("job_url")
        .eq("company_id", companyId)
      const existingUrls = new Set((existingJobs || []).map((j) => j.job_url).filter(Boolean))

      const previewJobs = jobs.map((job) => ({
        title: job.title,
        location: job.location,
        jobUrl: job.jobUrl,
        type: job.type,
        salaryRange: job.salaryRange,
        experience: job.experience,
        departments: job.departments,
        isExisting: existingUrls.has(job.jobUrl),
      }))

      return NextResponse.json({ preview: true, jobs: previewJobs, totalFound: jobs.length })
    }
    
    if (jobs.length === 0) {
      return NextResponse.json({ addedCount: 0, totalFound: 0, message: "No jobs found from ATS API" })
    }

    // If selectedJobUrls provided, filter to only those jobs
    if (selectedJobUrls && Array.isArray(selectedJobUrls)) {
      const selectedSet = new Set(selectedJobUrls)
      jobs = jobs.filter((job) => selectedSet.has(job.jobUrl))
      console.log('Filtered to selected jobs:', jobs.length)
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
      .select("id, job_url")
      .eq("company_id", companyId)

    const existingUrlMap = new Map(
      (existingJobs || []).filter((j) => j.job_url).map((j) => [j.job_url, j.id])
    )

    let addedCount = 0
    let updatedCount = 0

    for (const job of jobs) {
      if (!job.jobUrl) continue

      const jobData = {
        company_id: companyId,
        company_name: company.name || "Unknown",
        company_initial: company.logo_initial || "?",
        title: job.title || "Untitled Position",
        location: job.location || "Remote",
        type: normalizeJobType(job.type),
        salary_range: job.salaryRange || "Competitive salary",
        experience: normalizeExperienceLevel(job.experience),
        portal_url: job.jobUrl || "",
        job_url: job.jobUrl || "",
        company_website: company.website || null,
        company_linkedin: company.linkedin_url || null,
        description: job.description || "",
        requirements: job.requirements || [],
        skills: job.skills || [],
        benefits: job.benefits || [],
        detailed_requirements: job.detailedRequirements || job.departments || "",
        education_level: job.educationLevel || null,
        work_authorization: job.workAuthorization || null,
      }

      if (existingUrlMap.has(job.jobUrl)) {
        const { error } = await supabase
          .from("jobs")
          .update(jobData)
          .eq("company_id", companyId)
          .eq("job_url", job.jobUrl)
        if (error) {
          console.error('Error updating job:', error)
        } else {
          updatedCount++
        }
      } else {
        const jobId = `${company.logo_initial}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
        const { error } = await supabase.from("jobs").insert({
          id: jobId,
          ...jobData,
          status: "queued",
          total_apps: 0,
          right_swipes: 0,
          success_rate: 0,
          avg_time: "-",
          posted_at: new Date().toISOString().split("T")[0],
        })
        if (error) {
          console.error('Error inserting job:', error)
        } else {
          addedCount++
        }
      }
    }
    
    console.log('Sync complete. Added:', addedCount, 'Updated:', updatedCount)

    return NextResponse.json({ 
      addedCount,
      updatedCount,
      totalFound: jobs.length,
      message: `Added ${addedCount} new jobs, updated ${updatedCount} existing jobs from ${atsType}` 
    })
  } catch (error) {
    console.error("ATS sync error:", error)
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}

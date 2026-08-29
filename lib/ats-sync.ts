/**
 * Core ATS sync logic — shared between the HTTP route and the cron job.
 *
 * Extracting this into a lib function means the cron can call it directly
 * instead of making an internal HTTP round-trip through the full network stack.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { htmlToMarkdown } from '@/lib/html-converter'
import {
  parseJobContent, parseSalaryFromText,
  mapLeverCommitment, mapAshbyEmploymentType, mapSmartRecruitersEmploymentType,
  normalizeExperienceLevel, normalizeJobType,
} from '@/lib/job-parser'
import { jobDedupeKey, stableJobId } from '@/lib/job-identity'

const ATS_APIS = {
  greenhouse:      (id: string) => `https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`,
  lever:           (id: string) => `https://api.lever.co/v0/postings/${id}?mode=json`,
  ashby:           (id: string) => `https://api.ashbyhq.com/posting-api/job-board/${id}`,
  smartrecruiters: (id: string) => `https://api.smartrecruiters.com/v1/companies/${id}/postings`,
}

function decodeAndSanitize(content: string): string {
  let decoded = content
  for (let i = 0; i < 3; i++) {
    const temp = decoded
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    if (temp === decoded) break
    decoded = temp
  }
  return decoded
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .trim()
}

function formatSalary(min: string, max: string): string {
  if (min && max) return `$${Number(min).toLocaleString()} - $${Number(max).toLocaleString()}`
  if (min) return `$${Number(min).toLocaleString()}+`
  return 'Competitive salary'
}

export async function fetchJobsFromAts(atsType: string, atsCompanyId: string): Promise<any[]> {
  if (atsType === 'greenhouse') return fetchGreenhouseJobs(atsCompanyId)
  if (atsType === 'lever')      return fetchLeverJobs(atsCompanyId)
  if (atsType === 'ashby')      return fetchAshbyJobs(atsCompanyId)
  if (atsType === 'smartrecruiters') return fetchSmartRecruitersJobs(atsCompanyId)
  throw new Error(`Unknown ATS type: ${atsType}`)
}

export interface SyncResult {
  addedCount: number
  updatedCount: number
  deletedCount: number
  totalLive: number
}

/**
 * Sync one company's jobs from its ATS into the database.
 * Returns counts of added/updated/deleted rows.
 */
export async function syncCompanyJobs(companyId: string, atsType: string, atsCompanyId: string): Promise<SyncResult> {
  const supabase = createAdminClient()

  // fetchJobsFromAts throws on API error — let it propagate so the caller
  // knows the sync failed and does NOT delete any existing jobs.
  const jobs = await fetchJobsFromAts(atsType, atsCompanyId)
  const liveJobUrls = jobs.map((j: any) => j.jobUrl).filter(Boolean)
  const liveUrlSet  = new Set(liveJobUrls.map(jobDedupeKey))

  const { data: company } = await supabase
    .from('companies')
    .select('name, logo_initial, website, linkedin_url')
    .eq('id', companyId)
    .single()

  if (!company) throw new Error(`Company ${companyId} not found`)

  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('id, job_url')
    .eq('company_id', companyId)

  const existingUrlMap = new Map(
    (existingJobs || []).filter(j => j.job_url).map(j => [jobDedupeKey(j.job_url), j.id])
  )

  const today = new Date().toISOString().split('T')[0]
  const toInsert: any[] = []
  const toUpdate: Array<{ id: string; data: any }> = []

  for (const job of jobs) {
    if (!job.jobUrl) continue
    const jobData = {
      company_id: companyId,
      company_name: company.name || 'Unknown',
      company_initial: company.logo_initial || '?',
      title: job.title || 'Untitled Position',
      location: job.location || 'Remote',
      type: normalizeJobType(job.type),
      salary_range: job.salaryRange || 'Competitive salary',
      experience: normalizeExperienceLevel(job.experience),
      portal_url: job.jobUrl || '',
      job_url: job.jobUrl || '',
      company_website: company.website || null,
      company_linkedin: company.linkedin_url || null,
      description: job.description || '',
      requirements: job.requirements || [],
      skills: job.skills || [],
      benefits: job.benefits || [],
      detailed_requirements: job.detailedRequirements || job.departments || '',
      education_level: job.educationLevel || null,
      work_authorization: job.workAuthorization || null,
    }

    const dedupeKey  = jobDedupeKey(job.jobUrl)
    const existingId = existingUrlMap.get(dedupeKey)

    if (existingId) {
      toUpdate.push({ id: existingId, data: jobData })
    } else {
      toInsert.push({
        id: stableJobId(company.logo_initial, job.jobUrl, job.title),
        ...jobData,
        status: 'queued', total_apps: 0, right_swipes: 0, success_rate: 0, avg_time: '-',
        posted_at: today,
      })
    }
  }

  // Batch insert new jobs (one round-trip instead of N)
  let addedCount = 0
  if (toInsert.length > 0) {
    const CHUNK = 50
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error } = await supabase.from('jobs').insert(toInsert.slice(i, i + CHUNK))
      if (!error) addedCount += Math.min(CHUNK, toInsert.length - i)
      else console.error(`[ats-sync] batch insert error (chunk ${i}):`, error.message)
    }
  }

  // Update existing jobs in parallel batches of 10
  let updatedCount = 0
  if (toUpdate.length > 0) {
    const CHUNK = 10
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK)
      const results = await Promise.allSettled(
        chunk.map(({ id, data }) => supabase.from('jobs').update(data).eq('id', id))
      )
      updatedCount += results.filter(r => r.status === 'fulfilled' && !r.value.error).length
    }
  }

  // Delete stale jobs — postings no longer live on the ATS.
  // Guard: only delete when the ATS returned at least one job. If the ATS
  // returned zero (genuine empty board OR silent API failure), we skip deletion
  // to avoid wiping the entire job list on a transient error.
  // The cleanup-jobs route handles the explicit "delete non-existing" flow.
  let deletedCount = 0
  if (liveUrlSet.size > 0) {
    const staleIds = (existingJobs || [])
      .filter(j => j.job_url && !liveUrlSet.has(jobDedupeKey(j.job_url)))
      .map(j => j.id)
    if (staleIds.length > 0) {
      const { error } = await supabase.from('jobs').delete().in('id', staleIds)
      if (!error) deletedCount = staleIds.length
      else console.error(`[ats-sync] stale job delete error:`, error.message)
    }
  }

  return { addedCount, updatedCount, deletedCount, totalLive: liveJobUrls.length }
}

// ── ATS fetchers (unchanged logic, just moved here) ──────────────────────────

async function fetchGreenhouseJobs(companyId: string) {
  const response = await fetch(ATS_APIS.greenhouse(companyId))
  if (!response.ok) throw new Error(`Greenhouse API returned ${response.status}`)
  const data = await response.json()
  return (data.jobs || []).map((job: any) => {
    let location = 'Remote'
    if (job.location?.name) location = job.location.name
    else if (job.offices?.length) location = job.offices.map((o: any) => o.name).join(', ')
    let description = '', detailedRequirements = '', requirements: string[] = [], skills: string[] = [], benefits: string[] = []
    let jobType = '', experienceLevel = '', salaryMin = '', salaryMax = '', educationLevel = null, workAuthorization = null
    if (job.content) {
      const html = decodeAndSanitize(job.content)
      const parsed = parseJobContent(html, job.title)
      ;({ requirements, skills, benefits, educationLevel, workAuthorization } = parsed)
      jobType = parsed.jobType || ''; experienceLevel = parsed.experienceLevel || ''
      salaryMin = parsed.salaryMin || ''; salaryMax = parsed.salaryMax || ''
      description = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500)
      detailedRequirements = htmlToMarkdown(html)
    }
    for (const meta of (job.metadata || [])) {
      if (!salaryMin && meta.value_type === 'currency_range' && meta.value) {
        salaryMin = meta.value.min_value?.toString() || ''; salaryMax = meta.value.max_value?.toString() || ''
      }
    }
    return { title: job.title || 'Untitled Position', location, jobUrl: job.absolute_url || '', description, detailedRequirements, type: jobType || 'Full-time', experience: experienceLevel, salaryRange: formatSalary(salaryMin, salaryMax), requirements, skills, benefits, departments: job.departments?.map((d: any) => d.name).join(', ') || '', educationLevel, workAuthorization }
  })
}

async function fetchLeverJobs(companyId: string) {
  const response = await fetch(ATS_APIS.lever(companyId))
  if (!response.ok) throw new Error(`Lever API returned ${response.status}`)
  const data = await response.json()
  return (data || []).map((job: any) => {
    const categories = job.categories || {}
    let fullHtml = (job.description || '') + ' ' + (job.additional || '')
    if (Array.isArray(job.lists)) {
      for (const list of job.lists) {
        fullHtml += `<h3>${list.text || ''}</h3><ul>`
        if (typeof list.content === 'string') fullHtml += list.content
        else if (Array.isArray(list.content)) fullHtml += list.content.map((i: any) => `<li>${typeof i === 'string' ? i : i?.content || ''}</li>`).join('')
        fullHtml += '</ul>'
      }
    }
    let description = '', detailedRequirements = '', requirements: string[] = [], skills: string[] = [], benefits: string[] = []
    let jobType = '', experienceLevel = '', salaryMin = '', salaryMax = '', educationLevel = null, workAuthorization = null
    if (fullHtml.trim()) {
      const html = decodeAndSanitize(fullHtml)
      const parsed = parseJobContent(html, job.text)
      ;({ requirements, skills, benefits, educationLevel, workAuthorization } = parsed)
      jobType = parsed.jobType || ''; experienceLevel = parsed.experienceLevel || ''
      salaryMin = parsed.salaryMin || ''; salaryMax = parsed.salaryMax || ''
      description = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500)
      detailedRequirements = htmlToMarkdown(html)
    }
    const leverType = mapLeverCommitment(categories.commitment || '')
    if (leverType) jobType = leverType
    if (!salaryMin && job.additional) {
      const s = parseSalaryFromText(job.additional)
      if (s) { salaryMin = s.min; salaryMax = s.max }
    }
    return { title: job.text || 'Untitled Position', location: categories.location || 'Remote', jobUrl: job.hostedUrl, description, detailedRequirements, type: jobType || 'Full-time', experience: experienceLevel, salaryRange: formatSalary(salaryMin, salaryMax), requirements, skills, benefits, departments: categories.team || '', educationLevel, workAuthorization }
  })
}

async function fetchAshbyJobs(companyId: string) {
  const response = await fetch(ATS_APIS.ashby(companyId))
  if (!response.ok) throw new Error(`Ashby API returned ${response.status}`)
  const data = await response.json()
  return (data.jobs || data.postings || data.results || []).map((job: any) => {
    const title = job.title || job.name || job.position || 'Untitled Position'
    const jobUrl = job.jobUrl || job.applyUrl || job.url || job.link || ''
    const descContent = job.descriptionHtml || job.description || job.descriptionPlain || job.info?.description || ''
    let description = '', detailedRequirements = '', requirements: string[] = [], skills: string[] = [], benefits: string[] = []
    let jobType = '', experienceLevel = '', salaryMin = '', salaryMax = '', educationLevel = null, workAuthorization = null
    if (descContent) {
      const html = decodeAndSanitize(descContent)
      const parsed = parseJobContent(html, title)
      ;({ requirements, skills, benefits, educationLevel, workAuthorization } = parsed)
      jobType = parsed.jobType || ''; experienceLevel = parsed.experienceLevel || ''
      salaryMin = parsed.salaryMin || ''; salaryMax = parsed.salaryMax || ''
      description = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500)
      detailedRequirements = htmlToMarkdown(html)
    }
    const ashbyType = mapAshbyEmploymentType(job.employmentType || '')
    if (ashbyType) jobType = ashbyType
    let location = job.location || job.locationName || job.office || 'Remote'
    if (job.isRemote) location = location ? `${location} (${job.workplaceType === 'hybrid' ? 'Hybrid' : 'Remote'})` : 'Remote'
    if (!salaryMin && job.compensation) {
      const comp = job.compensation
      if (comp.min && comp.max) { salaryMin = comp.min.toString(); salaryMax = comp.max.toString() }
      else if (comp.range) { const s = parseSalaryFromText(comp.range); if (s) { salaryMin = s.min; salaryMax = s.max } }
    }
    return { title, location, jobUrl, description, detailedRequirements, type: jobType || 'Full-time', experience: experienceLevel, salaryRange: formatSalary(salaryMin, salaryMax), requirements, skills, benefits, departments: job.department || job.team || '', educationLevel, workAuthorization }
  })
}

async function fetchSmartRecruitersJobs(companyId: string) {
  const baseUrl = ATS_APIS.smartrecruiters(companyId)
  const jobsList: any[] = []
  let offset = 0
  while (true) {
    const response = await fetch(`${baseUrl}?offset=${offset}&limit=100`)
    if (!response.ok) throw new Error(`SmartRecruiters API returned ${response.status}`)
    const data = await response.json()
    const page = data.content || data.postings || []
    jobsList.push(...page)
    offset += page.length
    if (page.length === 0 || offset >= (data.totalFound ?? 0)) break
  }
  const results: any[] = []
  for (let i = 0; i < jobsList.length; i += 10) {
    const batch = await Promise.all(jobsList.slice(i, i + 10).map(async (job: any) => {
      const title = job.name || job.title || 'Untitled Position'
      const jobUrl = job.ref || job.applyUrl || ''
      let location = 'Remote'
      if (job.location) {
        const loc = job.location
        const parts = [loc.city, loc.region, loc.country].filter(Boolean)
        if (parts.length) location = parts.join(', ')
        if (loc.remote) location = location !== 'Remote' ? `${location} (Remote)` : 'Remote'
      }
      let jobDetail = job
      if (job.id) {
        try {
          const r = await fetch(`https://api.smartrecruiters.com/v1/companies/${companyId}/postings/${job.id}`)
          if (r.ok) jobDetail = await r.json()
        } catch {}
      }
      let fullHtml = ''
      if (jobDetail.jobAd?.sections) {
        for (const section of Object.values(jobDetail.jobAd.sections) as any[]) {
          if (section?.text) fullHtml += section.text + ' '
        }
      }
      let description = '', detailedRequirements = '', requirements: string[] = [], skills: string[] = [], benefits: string[] = []
      let jobType = '', experienceLevel = '', salaryMin = '', salaryMax = '', educationLevel = null, workAuthorization = null
      if (fullHtml) {
        const html = decodeAndSanitize(fullHtml)
        const parsed = parseJobContent(html, title)
        ;({ requirements, skills, benefits, educationLevel, workAuthorization } = parsed)
        jobType = parsed.jobType || ''; experienceLevel = parsed.experienceLevel || ''
        salaryMin = parsed.salaryMin || ''; salaryMax = parsed.salaryMax || ''
        description = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500)
        detailedRequirements = htmlToMarkdown(html)
      }
      const srType = jobDetail.typeOfEmployment?.label || jobDetail.typeOfEmployment
      if (typeof srType === 'string' && srType) jobType = mapSmartRecruitersEmploymentType(srType)
      if (jobDetail.experienceLevel?.label) experienceLevel = jobDetail.experienceLevel.label
      if (!salaryMin && jobDetail.compensation) {
        salaryMin = jobDetail.compensation.min?.value?.toString() || ''
        salaryMax = jobDetail.compensation.max?.value?.toString() || ''
      }
      return { title, location, jobUrl, description, detailedRequirements, type: jobType || 'Full-time', experience: experienceLevel, salaryRange: formatSalary(salaryMin, salaryMax), requirements, skills, benefits, departments: jobDetail.department?.label || '', educationLevel, workAuthorization }
    }))
    results.push(...batch)
  }
  return results
}

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
  // First decode any double-encoded HTML entities (e.g. &amp;lt; → &lt; → <)
  let decoded = content
  for (let i = 0; i < 5; i++) {
    const temp = decoded
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/')
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

/** Strip all HTML tags and decode entities to produce a clean plain-text description snippet. */
function htmlToDescription(html: string, maxLen = 500): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen)
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
  const tag = `[ats-sync:${atsType}:${atsCompanyId}]`

  console.log(`${tag} fetching jobs from ATS API`)
  const jobs = await fetchJobsFromAts(atsType, atsCompanyId)
  console.log(`${tag} fetched ${jobs.length} live jobs from ATS`)

  const liveJobUrls = jobs.map((j: any) => j.jobUrl).filter(Boolean)
  const liveUrlSet  = new Set(liveJobUrls.map(jobDedupeKey))

  console.log(`${tag} loading company record from DB`)
  const { data: company } = await supabase
    .from('companies')
    .select('name, logo_initial, website, linkedin_url')
    .eq('id', companyId)
    .single()

  if (!company) throw new Error(`Company ${companyId} not found`)
  console.log(`${tag} company="${company.name}"`)

  console.log(`${tag} loading existing jobs from DB`)
  const { data: existingJobs } = await supabase
    .from('jobs')
    .select('id, job_url')
    .eq('company_id', companyId)

  console.log(`${tag} found ${existingJobs?.length ?? 0} existing jobs in DB`)

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
      experience: normalizeExperienceLevel(job.experience) || null,
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

  console.log(`${tag} classified: ${toInsert.length} to insert, ${toUpdate.length} to update`)

  let addedCount = 0
  if (toInsert.length > 0) {
    console.log(`${tag} inserting ${toInsert.length} new jobs`)
    const CHUNK = 50
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error, data } = await supabase
        .from('jobs')
        .upsert(toInsert.slice(i, i + CHUNK), { onConflict: 'id', ignoreDuplicates: true })
        .select('id')
      if (!error) {
        const n = data?.length ?? Math.min(CHUNK, toInsert.length - i)
        addedCount += n
        console.log(`${tag} inserted chunk ${Math.floor(i / CHUNK) + 1}: ${n} rows`)
      } else {
        console.error(`${tag} upsert error (chunk ${i}):`, error.message)
      }
    }
  }

  let updatedCount = 0
  if (toUpdate.length > 0) {
    console.log(`${tag} updating ${toUpdate.length} existing jobs`)
    const CHUNK = 10
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const chunk = toUpdate.slice(i, i + CHUNK)
      const results = await Promise.allSettled(
        chunk.map(({ id, data }) => supabase.from('jobs').update(data).eq('id', id))
      )
      const n = results.filter(r => r.status === 'fulfilled' && !r.value.error).length
      updatedCount += n
      console.log(`${tag} updated chunk ${Math.floor(i / CHUNK) + 1}: ${n}/${chunk.length} rows`)
    }
  }

  let deletedCount = 0
  if (liveUrlSet.size > 0) {
    const staleIds = (existingJobs || [])
      .filter(j => j.job_url && !liveUrlSet.has(jobDedupeKey(j.job_url)))
      .map(j => j.id)
    if (staleIds.length > 0) {
      console.log(`${tag} deleting ${staleIds.length} stale jobs`)
      const { error } = await supabase.from('jobs').delete().in('id', staleIds)
      if (!error) {
        deletedCount = staleIds.length
        console.log(`${tag} deleted ${deletedCount} stale jobs`)
      } else {
        console.error(`${tag} stale job delete error:`, error.message)
      }
    } else {
      console.log(`${tag} no stale jobs to delete`)
    }
  }

  console.log(`${tag} sync complete — added=${addedCount} updated=${updatedCount} deleted=${deletedCount} live=${liveJobUrls.length}`)

  // Queue jobs with no experience for async LLM enrichment
  const toEnrich = [
    ...toInsert.filter(j => !j.experience).map(j => ({ job_id: j.id, job_title: j.title })),
    ...toUpdate.filter(j => !j.data.experience).map(j => ({ job_id: j.id, job_title: j.data.title })),
  ]
  if (toEnrich.length > 0) {
    console.log(`${tag} queuing ${toEnrich.length} jobs for LLM experience enrichment`)
    await supabase.from('experience_enrichment_queue')
      .upsert(toEnrich.map(j => ({ job_id: j.job_id, job_title: j.job_title, status: 'pending' })), { onConflict: 'job_id', ignoreDuplicates: true })
  }

  return { addedCount, updatedCount, deletedCount, totalLive: liveJobUrls.length }
}

// ── ATS fetchers (unchanged logic, just moved here) ──────────────────────────

async function fetchGreenhouseJobs(companyId: string) {
  console.log(`[greenhouse:${companyId}] calling API`)
  const response = await fetch(ATS_APIS.greenhouse(companyId))
  if (!response.ok) throw new Error(`Greenhouse API returned ${response.status}`)
  const data = await response.json()
  console.log(`[greenhouse:${companyId}] API returned ${data.jobs?.length ?? 0} jobs, parsing`)
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
      description = htmlToDescription(html)
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
  console.log(`[lever:${companyId}] calling API`)
  const response = await fetch(ATS_APIS.lever(companyId))
  if (!response.ok) throw new Error(`Lever API returned ${response.status}`)
  const data = await response.json()
  console.log(`[lever:${companyId}] API returned ${data?.length ?? 0} jobs, parsing`)
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
      description = htmlToDescription(html)
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
  console.log(`[ashby:${companyId}] calling API`)
  const response = await fetch(ATS_APIS.ashby(companyId))
  if (!response.ok) throw new Error(`Ashby API returned ${response.status}`)
  const data = await response.json()
  const jobs = data.jobs || data.postings || data.results || []
  console.log(`[ashby:${companyId}] API returned ${jobs.length} jobs, parsing`)
  return jobs.map((job: any) => {
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
      description = htmlToDescription(html)
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
  console.log(`[smartrecruiters:${companyId}] calling API`)
  const baseUrl = ATS_APIS.smartrecruiters(companyId)
  const jobsList: any[] = []
  let offset = 0
  while (true) {
    const response = await fetch(`${baseUrl}?offset=${offset}&limit=100`)
    if (!response.ok) throw new Error(`SmartRecruiters API returned ${response.status}`)
    const data = await response.json()
    const page = data.content || data.postings || []
    jobsList.push(...page)
    console.log(`[smartrecruiters:${companyId}] page offset=${offset}: ${page.length} jobs (total so far: ${jobsList.length})`)
    offset += page.length
    if (page.length === 0 || offset >= (data.totalFound ?? 0)) break
  }
  console.log(`[smartrecruiters:${companyId}] fetched ${jobsList.length} jobs total, fetching details + parsing`)
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
        description = htmlToDescription(html)
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

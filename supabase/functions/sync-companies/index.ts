import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BATCH_SIZE = 5

// ─── ATS API endpoints ───────────────────────────────────────────────────────
const ATS_APIS: Record<string, (id: string) => string> = {
  greenhouse:      (id) => `https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`,
  lever:           (id) => `https://api.lever.co/v0/postings/${id}?mode=json`,
  ashby:           (id) => `https://api.ashbyhq.com/posting-api/job-board/${id}`,
  smartrecruiters: (id) => `https://api.smartrecruiters.com/v1/companies/${id}/postings`,
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function formatSalary(min: string, max: string): string {
  if (min && max) return `$${Number(min).toLocaleString()} - $${Number(max).toLocaleString()}`
  if (min) return `$${Number(min).toLocaleString()}+`
  return 'Competitive salary'
}

function normalizeJobType(t: string): string {
  if (!t) return 'Full-time'
  const l = t.toLowerCase()
  if (l.includes('part')) return 'Part-time'
  if (l.includes('contract')) return 'Contract'
  if (l.includes('intern')) return 'Internship'
  if (l.includes('freelance')) return 'Freelance'
  return 'Full-time'
}

function jobDedupeKey(url: string): string {
  return url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()
}

function stableJobId(initial: string, url: string, title: string): string {
  const raw = `${initial}:${url}:${title}`.toLowerCase()
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0
  }
  return `job-${Math.abs(hash).toString(36)}-${raw.slice(0, 8).replace(/[^a-z0-9]/g, '')}`
}

// ─── ATS fetchers ─────────────────────────────────────────────────────────────
async function fetchGreenhouse(companyId: string): Promise<any[]> {
  const res = await fetch(ATS_APIS.greenhouse(companyId))
  if (!res.ok) throw new Error(`Greenhouse ${res.status}`)
  const data = await res.json()
  return (data.jobs || []).map((job: any) => ({
    title: job.title || 'Untitled',
    location: job.location?.name || job.offices?.[0]?.name || 'Remote',
    jobUrl: job.absolute_url || '',
    type: 'Full-time',
    description: job.content ? stripHtml(job.content).slice(0, 500) : '',
  }))
}

async function fetchLever(companyId: string): Promise<any[]> {
  const res = await fetch(ATS_APIS.lever(companyId))
  if (!res.ok) throw new Error(`Lever ${res.status}`)
  const data = await res.json()
  return (data || []).map((job: any) => ({
    title: job.text || 'Untitled',
    location: job.categories?.location || 'Remote',
    jobUrl: job.hostedUrl || '',
    type: normalizeJobType(job.categories?.commitment || ''),
    description: job.description ? stripHtml(job.description).slice(0, 500) : '',
  }))
}

async function fetchAshby(companyId: string): Promise<any[]> {
  const res = await fetch(ATS_APIS.ashby(companyId))
  if (!res.ok) throw new Error(`Ashby ${res.status}`)
  const data = await res.json()
  return (data.jobs || data.postings || data.results || []).map((job: any) => ({
    title: job.title || job.name || 'Untitled',
    location: job.location || job.locationName || 'Remote',
    jobUrl: job.jobUrl || job.applyUrl || job.url || '',
    type: normalizeJobType(job.employmentType || ''),
    description: job.descriptionPlain ? job.descriptionPlain.slice(0, 500) : '',
  }))
}

async function fetchSmartRecruiters(companyId: string): Promise<any[]> {
  const res = await fetch(`${ATS_APIS.smartrecruiters(companyId)}?limit=100`)
  if (!res.ok) throw new Error(`SmartRecruiters ${res.status}`)
  const data = await res.json()
  return (data.content || []).map((job: any) => ({
    title: job.name || 'Untitled',
    location: [job.location?.city, job.location?.country].filter(Boolean).join(', ') || 'Remote',
    jobUrl: job.ref || '',
    type: normalizeJobType(job.typeOfEmployment?.label || ''),
    description: '',
  }))
}

async function fetchJobs(atsType: string, atsCompanyId: string): Promise<any[]> {
  if (atsType === 'greenhouse') return fetchGreenhouse(atsCompanyId)
  if (atsType === 'lever') return fetchLever(atsCompanyId)
  if (atsType === 'ashby') return fetchAshby(atsCompanyId)
  if (atsType === 'smartrecruiters') return fetchSmartRecruiters(atsCompanyId)
  throw new Error(`Unknown ATS: ${atsType}`)
}

// ─── Core sync ────────────────────────────────────────────────────────────────
async function syncCompany(
  supabase: ReturnType<typeof createClient>,
  entryId: string,
  companyId: string,
): Promise<void> {
  try {
    const { data: company } = await supabase
      .from('companies')
      .select('name, logo_initial, website, linkedin_url, ats_type, ats_company_id')
      .eq('id', companyId)
      .single()

    if (!company?.ats_type || !company?.ats_company_id) throw new Error('Missing ATS config')

    const jobs = await fetchJobs(company.ats_type, company.ats_company_id)
    const liveUrlSet = new Set(jobs.map((j: any) => jobDedupeKey(j.jobUrl)).filter(Boolean))

    const { data: existing } = await supabase
      .from('jobs')
      .select('id, job_url')
      .eq('company_id', companyId)

    const existingMap = new Map(
      (existing || []).filter(j => j.job_url).map(j => [jobDedupeKey(j.job_url), j.id])
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
        title: job.title,
        location: job.location,
        type: job.type,
        salary_range: 'Competitive salary',
        experience: '',
        portal_url: job.jobUrl,
        job_url: job.jobUrl,
        company_website: company.website || null,
        company_linkedin: company.linkedin_url || null,
        description: job.description || '',
        requirements: [],
        skills: [],
        benefits: [],
      }
      const key = jobDedupeKey(job.jobUrl)
      const existingId = existingMap.get(key)
      if (existingId) {
        toUpdate.push({ id: existingId, data: jobData })
      } else {
        toInsert.push({
          id: stableJobId(company.logo_initial || '?', job.jobUrl, job.title),
          ...jobData,
          status: 'queued', total_apps: 0, right_swipes: 0, success_rate: 0,
          avg_time: '-', posted_at: today,
        })
      }
    }

    let addedCount = 0, updatedCount = 0, deletedCount = 0

    if (toInsert.length > 0) {
      const { error } = await supabase.from('jobs').insert(toInsert)
      if (!error) addedCount = toInsert.length
    }

    for (const { id, data } of toUpdate) {
      const { error } = await supabase.from('jobs').update(data).eq('id', id)
      if (!error) updatedCount++
    }

    if (liveUrlSet.size > 0) {
      const staleIds = (existing || [])
        .filter(j => j.job_url && !liveUrlSet.has(jobDedupeKey(j.job_url)))
        .map(j => j.id)
      if (staleIds.length > 0) {
        const { error } = await supabase.from('jobs').delete().in('id', staleIds)
        if (!error) deletedCount = staleIds.length
      }
    }

    await supabase.from('job_sync_queue').update({
      status: 'done',
      synced_at: new Date().toISOString(),
      result: { addedCount, updatedCount, deletedCount, totalLive: jobs.length },
    }).eq('id', entryId)

    await supabase.from('companies').update({
      sync_status: 'success',
      last_synced_at: new Date().toISOString(),
    }).eq('id', companyId)

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase.from('job_sync_queue').update({
      status: 'failed',
      synced_at: new Date().toISOString(),
      result: { error: message },
    }).eq('id', entryId)
    await supabase.from('companies').update({ sync_status: 'failed' }).eq('id', companyId)
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
  const incomingSecret = req.headers.get('x-cron-secret') ?? ''
  if (cronSecret && incomingSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: entries, error } = await supabase
    .from('job_sync_queue')
    .select('id, company_id')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error || !entries?.length) {
    return new Response(JSON.stringify({ message: 'No pending syncs due' }))
  }

  const entryIds = entries.map((e) => e.id)
  const companyIds = entries.map((e) => e.company_id)

  await Promise.all([
    supabase.from('job_sync_queue').update({ status: 'running' }).in('id', entryIds),
    supabase.from('companies').update({ sync_status: 'running' }).in('id', companyIds),
  ])

  // Run all syncs in parallel — Deno keeps the event loop alive until done.
  // No Vercel involved at all.
  await Promise.allSettled(
    entries.map((entry) => syncCompany(supabase, entry.id, entry.company_id))
  )

  return new Response(JSON.stringify({ synced: entries.length, entryIds }))
})

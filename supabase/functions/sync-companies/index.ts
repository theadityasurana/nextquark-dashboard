import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const JOBS_PER_INVOCATION = 200

const ATS_APIS: Record<string, (id: string) => string> = {
  greenhouse:      (id) => `https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`,
  lever:           (id) => `https://api.lever.co/v0/postings/${id}?mode=json`,
  ashby:           (id) => `https://api.ashbyhq.com/posting-api/job-board/${id}`,
  smartrecruiters: (id) => `https://api.smartrecruiters.com/v1/companies/${id}/postings`,
}

function stripHtml(html: string): string {
  let text = html
  for (let i = 0; i < 8; i++) {
    const prev = text
    text = text
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/')
    text = text.replace(/<[^>]*>/g, ' ')
    if (text === prev) break
  }
  return text.replace(/\s+/g, ' ').trim()
}

function normalizeJobType(t: string): string {
  if (!t) return 'Full-time'
  const l = t.toLowerCase()
  if (l.includes('part')) return 'Part-time'
  if (l.includes('contract') || l.includes('temp')) return 'Contract'
  if (l.includes('intern')) return 'Internship'
  if (l.includes('freelance')) return 'Freelance'
  return 'Full-time'
}

function extractExperienceFromTitle(title: string): string | null {
  const t = title.toLowerCase()
  if (/\bintern(?:ship)?\b|\bco[\s-]?op\b/.test(t)) return 'Internship'
  if (/\bc[\s-]?level\b|\bchief\b|\bceo\b|\bcto\b|\bcfo\b|\bcoo\b/.test(t)) return 'C-Level'
  if (/\bvp\b|\bvice[\s-]?president\b|\bsvp\b|\bevp\b/.test(t)) return 'VP'
  if (/\bdirector\b/.test(t)) return 'Director'
  if (/\bprincipal\b|\bstaff\b|\bdistinguished\b/.test(t)) return 'Principal'
  if (/\blead\b|\bhead\s+of\b/.test(t) && !/\bleader(?:ship)?\b/.test(t)) return 'Lead'
  if (/\bsenior\b|\bsr\.?\s/.test(t)) return 'Senior Level'
  if (/\bjunior\b|\bjr\.?\s|\bmid[\s-]?level\b/.test(t)) return 'Middle Level'
  if (/\bentry[\s-]?level\b|\bnew\s+grad\b|\btrainee\b/.test(t)) return 'Entry Level'
  return null
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

async function fetchJobs(atsType: string, atsCompanyId: string): Promise<any[]> {
  if (atsType === 'greenhouse') {
    const res = await fetch(ATS_APIS.greenhouse(atsCompanyId))
    if (!res.ok) throw new Error(`Greenhouse API ${res.status}`)
    const data = await res.json()
    return (data.jobs || []).map((job: any) => ({
      title: job.title || 'Untitled',
      location: job.location?.name || job.offices?.[0]?.name || 'Remote',
      jobUrl: job.absolute_url || '',
      type: 'Full-time',
      experience: extractExperienceFromTitle(job.title || ''),
      description: job.content ? stripHtml(job.content).slice(0, 500) : '',
    }))
  }
  if (atsType === 'lever') {
    const res = await fetch(ATS_APIS.lever(atsCompanyId))
    if (!res.ok) throw new Error(`Lever API ${res.status}`)
    const data = await res.json()
    return (data || []).map((job: any) => ({
      title: job.text || 'Untitled',
      location: job.categories?.location || 'Remote',
      jobUrl: job.hostedUrl || '',
      type: normalizeJobType(job.categories?.commitment || ''),
      experience: extractExperienceFromTitle(job.text || ''),
      description: job.description ? stripHtml(job.description).slice(0, 500) : '',
    }))
  }
  if (atsType === 'ashby') {
    const res = await fetch(ATS_APIS.ashby(atsCompanyId))
    if (!res.ok) throw new Error(`Ashby API ${res.status}`)
    const data = await res.json()
    return (data.jobs || data.postings || data.results || []).map((job: any) => ({
      title: job.title || job.name || 'Untitled',
      location: job.location || job.locationName || 'Remote',
      jobUrl: job.jobUrl || job.applyUrl || job.url || '',
      type: normalizeJobType(job.employmentType || ''),
      experience: extractExperienceFromTitle(job.title || job.name || ''),
      description: job.descriptionPlain ? stripHtml(job.descriptionPlain).slice(0, 500)
        : job.descriptionHtml ? stripHtml(job.descriptionHtml).slice(0, 500) : '',
    }))
  }
  if (atsType === 'smartrecruiters') {
    const res = await fetch(`${ATS_APIS.smartrecruiters(atsCompanyId)}?limit=100`)
    if (!res.ok) throw new Error(`SmartRecruiters API ${res.status}`)
    const data = await res.json()
    return (data.content || []).map((job: any) => ({
      title: job.name || 'Untitled',
      location: [job.location?.city, job.location?.country].filter(Boolean).join(', ') || 'Remote',
      jobUrl: job.ref || '',
      type: normalizeJobType(job.typeOfEmployment?.label || ''),
      experience: extractExperienceFromTitle(job.name || ''),
      description: '',
    }))
  }
  throw new Error(`Unknown ATS type: ${atsType}`)
}

// ── Log helper ────────────────────────────────────────────────────────────────
// Appends a log entry to sync_sessions.logs, keeping last 500 entries.
// Each entry: { ts, company, step, detail }
async function log(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  existingLogs: any[],
  company: string,
  step: string,
  detail: string
): Promise<any[]> {
  const entry = { ts: new Date().toISOString(), company, step, detail }
  const newLogs = [...existingLogs, entry].slice(-500)
  await supabase.from('sync_sessions').update({ logs: newLogs }).eq('id', sessionId)
  return newLogs
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const body = await req.json().catch(() => ({}))
  const {
    sessionId,
    companyIndex = 0,
    pendingJobs,
    allJobUrls,
    existingUrlMap,
    companyMeta,
    pageAdded = 0,
    pageUpdated = 0,
  } = body

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing sessionId' }), { status: 400 })
  }

  const { data: session } = await supabase
    .from('sync_sessions').select('*').eq('id', sessionId).single()

  if (!session || session.status === 'done' || session.status === 'cancelled') {
    return new Response(JSON.stringify({ message: 'Session already done or cancelled' }))
  }

  let currentLogs: any[] = session.logs ?? []

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, ats_type, ats_company_id, logo_initial, website, linkedin_url')
    .not('ats_type', 'is', null)
    .not('ats_company_id', 'is', null)
    .order('name', { ascending: true })

  if (!companies?.length) {
    await supabase.from('sync_sessions').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', sessionId).eq('status', 'running')
    return new Response(JSON.stringify({ message: 'No companies' }))
  }

  if (companyIndex >= companies.length) {
    await supabase.from('sync_sessions')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('id', sessionId).eq('status', 'running')
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-experience`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({}),
    })
    return new Response(JSON.stringify({ done: true }))
  }

  const company = companyMeta ?? companies[companyIndex]
  const results: any[] = session.results || []
  const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-companies`

  // ── LARGE COMPANY: continuing mid-page ───────────────────────────────────
  if (pendingJobs) {
    const page: any[] = pendingJobs.slice(0, JOBS_PER_INVOCATION)
    const remaining: any[] = pendingJobs.slice(JOBS_PER_INVOCATION)
    const existingMap = new Map(Object.entries(existingUrlMap ?? {}))
    const today = new Date().toISOString().split('T')[0]
    const toInsert: any[] = []
    const toUpdate: any[] = []

    for (const job of page) {
      if (!job.jobUrl) continue
      const jobData = {
        company_id: company.id, company_name: company.name,
        company_initial: company.logo_initial || '?',
        title: job.title, location: job.location, type: job.type,
        experience: job.experience ?? null, salary_range: 'Competitive salary',
        portal_url: job.jobUrl, job_url: job.jobUrl,
        company_website: company.website || null, company_linkedin: company.linkedin_url || null,
        description: job.description || '', requirements: [], skills: [], benefits: [],
      }
      const existingId = existingMap.get(jobDedupeKey(job.jobUrl))
      if (existingId) toUpdate.push({ id: existingId as string, ...jobData })
      else toInsert.push({ id: stableJobId(company.logo_initial || '?', job.jobUrl, job.title), ...jobData, status: 'queued', total_apps: 0, right_swipes: 0, success_rate: 0, avg_time: '-', posted_at: today })
    }

    const allRows = [...toInsert, ...toUpdate]
    if (allRows.length > 0) {
      await supabase.from('jobs').upsert(allRows, { onConflict: 'id', ignoreDuplicates: false })
    }

    const toEnrich = allRows.filter(r => !r.experience).map(r => ({ job_id: r.id, job_title: r.title, company_name: company.name, status: 'pending' }))
    if (toEnrich.length > 0) {
      await supabase.from('experience_enrichment_queue').upsert(toEnrich, { onConflict: 'job_id', ignoreDuplicates: true })
    }

    const totalAdded = pageAdded + toInsert.length
    const totalUpdated = pageUpdated + toUpdate.length
    const processed = pendingJobs.length - remaining.length
    const totalJobs = (allJobUrls as string[]).length

    currentLogs = await log(supabase, sessionId, currentLogs, company.name,
      'processing',
      `Page ${Math.ceil(processed / JOBS_PER_INVOCATION)} — +${toInsert.length} added, ↻${toUpdate.length} updated (${processed}/${totalJobs} jobs processed)`
    )

    if (remaining.length > 0) {
      fetch(selfUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ sessionId, companyIndex, pendingJobs: remaining, allJobUrls, existingUrlMap, companyMeta: company, pageAdded: totalAdded, pageUpdated: totalUpdated }),
      })
      return new Response(JSON.stringify({ company: company.name, remaining: remaining.length }))
    }

    // Last page — stale deletion
    const liveUrlSet = new Set((allJobUrls as string[]).map(jobDedupeKey))
    const { data: existingJobsForDelete } = await supabase.from('jobs').select('id, job_url').eq('company_id', company.id)
    const staleIds = (existingJobsForDelete || []).filter((j: any) => j.job_url && !liveUrlSet.has(jobDedupeKey(j.job_url))).map((j: any) => j.id)
    let deletedCount = 0
    if (staleIds.length > 0) {
      currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'deleting', `Removing ${staleIds.length} stale jobs`)
      await supabase.from('live_application_queue').delete().in('job_id', staleIds)
      const { error } = await supabase.from('jobs').delete().in('id', staleIds)
      if (!error) deletedCount = staleIds.length
    }

    currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'done',
      `✓ ${totalJobs} live jobs — +${totalAdded} added, ↻${totalUpdated} updated, ${deletedCount} deleted`
    )

    results.push({ company: company.name, added: totalAdded, updated: totalUpdated, deleted: deletedCount, total: totalJobs })
    const done = companyIndex + 1
    const failed = results.filter(r => r.error).length
    await supabase.from('sync_sessions').update({
      done, failed,
      added: results.reduce((s, r) => s + (r.added ?? 0), 0),
      updated: results.reduce((s, r) => s + (r.updated ?? 0), 0),
      deleted: results.reduce((s, r) => s + (r.deleted ?? 0), 0),
      results, logs: currentLogs,
    }).eq('id', sessionId)

    fetch(selfUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ sessionId, companyIndex: companyIndex + 1 }),
    })
    return new Response(JSON.stringify({ company: company.name, done, total: companies.length }))
  }

  // ── NORMAL FLOW: first invocation for this company ────────────────────────
  let resultEntry: any
  try {
    currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'fetching', `Calling ${company.ats_type} API (${company.ats_company_id})`)

    const jobs = await fetchJobs(company.ats_type, company.ats_company_id)
    const allUrls = jobs.map((j: any) => j.jobUrl).filter(Boolean)

    currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'fetched', `${jobs.length} live jobs from ${company.ats_type}`)

    const { data: existing } = await supabase.from('jobs').select('id, job_url').eq('company_id', company.id)
    const existingMapObj: Record<string, string> = {}
    for (const j of existing || []) {
      if (j.job_url) existingMapObj[jobDedupeKey(j.job_url)] = j.id
    }

    currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'comparing', `${existing?.length ?? 0} jobs in DB — classifying changes`)

    if (jobs.length <= JOBS_PER_INVOCATION) {
      const existingMap = new Map(Object.entries(existingMapObj))
      const liveUrlSet = new Set(allUrls.map(jobDedupeKey))
      const today = new Date().toISOString().split('T')[0]
      const toInsert: any[] = []
      const toUpdate: any[] = []

      for (const job of jobs) {
        if (!job.jobUrl) continue
        const jobData = {
          company_id: company.id, company_name: company.name,
          company_initial: company.logo_initial || '?',
          title: job.title, location: job.location, type: job.type,
          experience: job.experience ?? null, salary_range: 'Competitive salary',
          portal_url: job.jobUrl, job_url: job.jobUrl,
          company_website: company.website || null, company_linkedin: company.linkedin_url || null,
          description: job.description || '', requirements: [], skills: [], benefits: [],
        }
        const existingId = existingMap.get(jobDedupeKey(job.jobUrl))
        if (existingId) toUpdate.push({ id: existingId, ...jobData })
        else toInsert.push({ id: stableJobId(company.logo_initial || '?', job.jobUrl, job.title), ...jobData, status: 'queued', total_apps: 0, right_swipes: 0, success_rate: 0, avg_time: '-', posted_at: today })
      }

      if (toInsert.length > 0) {
        currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'inserting', `Adding ${toInsert.length} new jobs`)
      }
      if (toUpdate.length > 0) {
        currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'updating', `Updating ${toUpdate.length} existing jobs`)
      }

      const allRows = [...toInsert, ...toUpdate]
      if (allRows.length > 0) {
        await supabase.from('jobs').upsert(allRows, { onConflict: 'id', ignoreDuplicates: false })
      }

      const toEnrich = allRows.filter(r => !r.experience).map(r => ({ job_id: r.id, job_title: r.title, company_name: company.name, status: 'pending' }))
      if (toEnrich.length > 0) {
        await supabase.from('experience_enrichment_queue').upsert(toEnrich, { onConflict: 'job_id', ignoreDuplicates: true })
      }

      const staleIds = (existing || []).filter((j: any) => j.job_url && !liveUrlSet.has(jobDedupeKey(j.job_url))).map((j: any) => j.id)
      let deletedCount = 0
      if (staleIds.length > 0) {
        currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'deleting', `Removing ${staleIds.length} stale jobs`)
        await supabase.from('live_application_queue').delete().in('job_id', staleIds)
        const { error } = await supabase.from('jobs').delete().in('id', staleIds)
        if (!error) deletedCount = staleIds.length
      }

      currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'done',
        `✓ ${jobs.length} live — +${toInsert.length} added, ↻${toUpdate.length} updated, ${deletedCount} deleted`
      )

      resultEntry = { company: company.name, added: toInsert.length, updated: toUpdate.length, deleted: deletedCount, total: jobs.length }
    } else {
      currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'large',
        `${jobs.length} jobs — processing in ${Math.ceil(jobs.length / JOBS_PER_INVOCATION)} pages of ${JOBS_PER_INVOCATION}`
      )

      fetch(selfUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({
          sessionId, companyIndex,
          pendingJobs: jobs,
          allJobUrls: allUrls,
          existingUrlMap: existingMapObj,
          companyMeta: company,
          pageAdded: 0, pageUpdated: 0,
        }),
      })
      return new Response(JSON.stringify({ company: company.name, total: jobs.length }))
    }
  } catch (err: any) {
    currentLogs = await log(supabase, sessionId, currentLogs, company.name, 'error', `✗ ${err.message}`)
    resultEntry = { company: company.name, error: err.message }
  }

  results.push(resultEntry)
  const done = companyIndex + 1
  const failed = results.filter(r => r.error).length
  await supabase.from('sync_sessions').update({
    done, failed,
    added: results.reduce((s, r) => s + (r.added ?? 0), 0),
    updated: results.reduce((s, r) => s + (r.updated ?? 0), 0),
    deleted: results.reduce((s, r) => s + (r.deleted ?? 0), 0),
    results, logs: currentLogs,
  }).eq('id', sessionId)

  fetch(selfUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ sessionId, companyIndex: companyIndex + 1 }),
  })

  return new Response(JSON.stringify({ company: company.name, companyIndex, done, total: companies.length }))
})

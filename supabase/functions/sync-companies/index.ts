import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ATS_APIS: Record<string, (id: string) => string> = {
  greenhouse:      (id) => `https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`,
  lever:           (id) => `https://api.lever.co/v0/postings/${id}?mode=json`,
  ashby:           (id) => `https://api.ashbyhq.com/posting-api/job-board/${id}`,
  smartrecruiters: (id) => `https://api.smartrecruiters.com/v1/companies/${id}/postings`,
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  let decoded = html
  for (let i = 0; i < 5; i++) {
    const next = decoded
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/')
    if (next === decoded) break
    decoded = next
  }
  return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeJobType(t: string): string {
  if (!t) return 'Full-time'
  const l = t.toLowerCase()
  if (l.includes('part')) return 'Part-time'
  if (l.includes('contract') || l.includes('temp')) return 'Contract'
  if (l.includes('intern')) return 'Internship'
  if (l.includes('freelance')) return 'Freelance'
  return 'Full-time'
}

/** Fast title-only heuristic — zero cost, covers ~70% of jobs */
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

// ── ATS fetchers ──────────────────────────────────────────────────────────────

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
      // descriptionPlain can still contain encoded HTML — always run through stripHtml
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

// ── Core sync (no LLM — fast and reliable) ───────────────────────────────────

async function syncOneCompany(
  supabase: ReturnType<typeof createClient>,
  company: any
): Promise<{ added: number; updated: number; deleted: number; total: number; toEnrich: Array<{ id: string; title: string }> }> {
  const jobs = await fetchJobs(company.ats_type, company.ats_company_id)
  const liveUrlSet = new Set(jobs.map((j: any) => jobDedupeKey(j.jobUrl)).filter(Boolean))

  const { data: existing } = await supabase
    .from('jobs').select('id, job_url').eq('company_id', company.id)

  const existingMap = new Map(
    (existing || []).filter((j: any) => j.job_url).map((j: any) => [jobDedupeKey(j.job_url), j.id])
  )

  const today = new Date().toISOString().split('T')[0]
  const toInsert: any[] = []
  const toUpdate: any[] = []

  for (const job of jobs) {
    if (!job.jobUrl) continue
    const jobData = {
      company_id: company.id,
      company_name: company.name,
      company_initial: company.logo_initial || '?',
      title: job.title,
      location: job.location,
      type: job.type,
      experience: job.experience ?? null,
      salary_range: 'Competitive salary',
      portal_url: job.jobUrl,
      job_url: job.jobUrl,
      company_website: company.website || null,
      company_linkedin: company.linkedin_url || null,
      description: job.description || '',
      requirements: [], skills: [], benefits: [],
    }
    const key = jobDedupeKey(job.jobUrl)
    const existingId = existingMap.get(key)
    if (existingId) {
      toUpdate.push({ id: existingId, ...jobData })
    } else {
      toInsert.push({
        id: stableJobId(company.logo_initial || '?', job.jobUrl, job.title),
        ...jobData,
        status: 'queued', total_apps: 0, right_swipes: 0, success_rate: 0, avg_time: '-', posted_at: today,
      })
    }
  }

  let addedCount = 0, updatedCount = 0, deletedCount = 0

  const allRows = [...toInsert, ...toUpdate]
  if (allRows.length > 0) {
    const CHUNK = 500
    for (let i = 0; i < allRows.length; i += CHUNK) {
      await supabase.from('jobs')
        .upsert(allRows.slice(i, i + CHUNK), { onConflict: 'id', ignoreDuplicates: false })
      const chunkEnd = Math.min(i + CHUNK, allRows.length)
      addedCount += Math.max(0, Math.min(chunkEnd, toInsert.length) - i)
      updatedCount += Math.max(0, chunkEnd - Math.max(i, toInsert.length))
    }
  }

  if (liveUrlSet.size > 0) {
    const staleIds = (existing || [])
      .filter((j: any) => j.job_url && !liveUrlSet.has(jobDedupeKey(j.job_url)))
      .map((j: any) => j.id)
    if (staleIds.length > 0) {
      await supabase.from('live_application_queue').delete().in('job_id', staleIds)
      const { error } = await supabase.from('jobs').delete().in('id', staleIds)
      if (!error) deletedCount = staleIds.length
    }
  }

  // Collect jobs that need LLM enrichment (heuristic returned null)
  // We need the stable IDs we just upserted
  const toEnrich: Array<{ id: string; title: string }> = []
  for (const row of allRows) {
    if (row.experience === null || row.experience === undefined) {
      toEnrich.push({ id: row.id, title: row.title })
    }
  }

  return { added: addedCount, updated: updatedCount, deleted: deletedCount, total: jobs.length, toEnrich }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const body = await req.json().catch(() => ({}))
  const { sessionId, companyIndex = 0 } = body

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing sessionId' }), { status: 400 })
  }

  const { data: session } = await supabase
    .from('sync_sessions').select('*').eq('id', sessionId).single()

  if (!session || session.status === 'done') {
    return new Response(JSON.stringify({ message: 'Session already done' }))
  }

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, ats_type, ats_company_id, logo_initial, website, linkedin_url')
    .not('ats_type', 'is', null)
    .not('ats_company_id', 'is', null)
    .order('name', { ascending: true })

  if (!companies?.length) {
    await supabase.from('sync_sessions').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', sessionId)
    return new Response(JSON.stringify({ message: 'No companies' }))
  }

  if (companyIndex >= companies.length) {
    await supabase.from('sync_sessions').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', sessionId)
    // Kick off LLM enrichment now that all companies are synced
    const enrichUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-experience`
    fetch(enrichUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({}),
    })
    return new Response(JSON.stringify({ done: true }))
  }

  const company = companies[companyIndex]
  const results: any[] = session.results || []

  let resultEntry: any
  try {
    const result = await syncOneCompany(supabase, company)
    resultEntry = { company: company.name, added: result.added, updated: result.updated, deleted: result.deleted, total: result.total }

    // Queue unclassified jobs for async LLM enrichment
    if (result.toEnrich.length > 0) {
      const queueRows = result.toEnrich.map(j => ({
        job_id: j.id,
        job_title: j.title,
        status: 'pending',
      }))
      // ON CONFLICT DO NOTHING — don't re-queue jobs already waiting
      await supabase.from('experience_enrichment_queue')
        .upsert(queueRows, { onConflict: 'job_id', ignoreDuplicates: true })
    }
  } catch (err: any) {
    resultEntry = { company: company.name, error: err.message }
  }

  results.push(resultEntry)

  const done = companyIndex + 1
  const failed = results.filter(r => r.error).length
  const totalAdded = results.reduce((s, r) => s + (r.added ?? 0), 0)
  const totalUpdated = results.reduce((s, r) => s + (r.updated ?? 0), 0)
  const totalDeleted = results.reduce((s, r) => s + (r.deleted ?? 0), 0)

  await supabase.from('sync_sessions').update({
    done, failed, added: totalAdded, updated: totalUpdated, deleted: totalDeleted, results,
  }).eq('id', sessionId)

  // Self-invoke for next company
  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ sessionId, companyIndex: companyIndex + 1 }),
  })

  return new Response(JSON.stringify({ company: company.name, companyIndex, done, total: companies.length }))
})

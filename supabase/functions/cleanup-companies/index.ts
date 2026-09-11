import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ATS_APIS: Record<string, (id: string) => string> = {
  greenhouse:      (id) => `https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`,
  lever:           (id) => `https://api.lever.co/v0/postings/${id}?mode=json`,
  ashby:           (id) => `https://api.ashbyhq.com/posting-api/job-board/${id}`,
  smartrecruiters: (id) => `https://api.smartrecruiters.com/v1/companies/${id}/postings`,
}

function jobDedupeKey(url: string): string {
  return url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase()
}

async function fetchLiveUrls(atsType: string, atsCompanyId: string): Promise<Set<string>> {
  let urls: string[] = []
  if (atsType === 'greenhouse') {
    const res = await fetch(ATS_APIS.greenhouse(atsCompanyId))
    if (!res.ok) throw new Error(`Greenhouse API ${res.status}`)
    const data = await res.json()
    urls = (data.jobs || []).map((j: any) => j.absolute_url).filter(Boolean)
  } else if (atsType === 'lever') {
    const res = await fetch(ATS_APIS.lever(atsCompanyId))
    if (!res.ok) throw new Error(`Lever API ${res.status}`)
    const data = await res.json()
    urls = (data || []).map((j: any) => j.hostedUrl).filter(Boolean)
  } else if (atsType === 'ashby') {
    const res = await fetch(ATS_APIS.ashby(atsCompanyId))
    if (!res.ok) throw new Error(`Ashby API ${res.status}`)
    const data = await res.json()
    urls = (data.jobs || data.postings || data.results || [])
      .map((j: any) => j.jobUrl || j.applyUrl || j.url).filter(Boolean)
  } else if (atsType === 'smartrecruiters') {
    const res = await fetch(`${ATS_APIS.smartrecruiters(atsCompanyId)}?limit=100`)
    if (!res.ok) throw new Error(`SmartRecruiters API ${res.status}`)
    const data = await res.json()
    urls = (data.content || []).map((j: any) => j.ref).filter(Boolean)
  }
  return new Set(urls.map(jobDedupeKey))
}

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
    .from('sync_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (!session || session.status === 'done') {
    return new Response(JSON.stringify({ message: 'Session already done' }))
  }

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, ats_type, ats_company_id')
    .not('ats_type', 'is', null)
    .not('ats_company_id', 'is', null)
    .order('name', { ascending: true })

  if (!companies?.length) {
    await supabase.from('sync_sessions').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', sessionId)
    return new Response(JSON.stringify({ message: 'No companies' }))
  }

  if (companyIndex >= companies.length) {
    await supabase.from('sync_sessions').update({
      status: 'done',
      finished_at: new Date().toISOString(),
    }).eq('id', sessionId)
    return new Response(JSON.stringify({ done: true }))
  }

  const company = companies[companyIndex]
  const results: any[] = session.results || []

  let resultEntry: any
  try {
    const liveUrlSet = await fetchLiveUrls(company.ats_type, company.ats_company_id)

    const { data: dbJobs } = await supabase
      .from('jobs')
      .select('id, job_url')
      .eq('company_id', company.id)
      .not('job_url', 'is', null)
      .neq('job_url', '')

    const staleIds = (dbJobs || [])
      .filter((j: any) => !liveUrlSet.has(jobDedupeKey(j.job_url)))
      .map((j: any) => j.id)

    let deletedCount = 0
    if (staleIds.length > 0) {
      await supabase.from('live_application_queue').delete().in('job_id', staleIds)
      const { error } = await supabase.from('jobs').delete().in('id', staleIds)
      if (!error) deletedCount = staleIds.length
    }

    resultEntry = { company: company.name, deleted: deletedCount, checked: (dbJobs || []).length }
  } catch (err: any) {
    resultEntry = { company: company.name, error: err.message }
  }

  results.push(resultEntry)

  const done = companyIndex + 1
  const failed = results.filter(r => r.error).length
  const totalDeleted = results.reduce((s, r) => s + (r.deleted ?? 0), 0)

  await supabase.from('sync_sessions').update({
    done,
    failed,
    deleted: totalDeleted,
    results,
  }).eq('id', sessionId)

  // Self-invoke for the next company
  const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cleanup-companies`
  fetch(selfUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ sessionId, companyIndex: companyIndex + 1 }),
  })

  return new Response(JSON.stringify({ company: company.name, companyIndex, done, total: companies.length }))
})

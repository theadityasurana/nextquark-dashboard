import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { fetchJobsFromAts, syncCompanyJobs } from '@/lib/ats-sync'
import { jobDedupeKey } from '@/lib/job-identity'
import { after } from 'next/server'

export const maxDuration = 60

const PARALLEL_COMPANIES = 3

async function runInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.allSettled(items.slice(i, i + batchSize).map(fn))
  }
}

async function runSync(sessionId: string, companiesToSync: any[]) {
  const supabase = createAdminClient()
  let done = 0, failed = 0, totalAdded = 0, totalUpdated = 0
  const results: any[] = []

  await runInBatches(companiesToSync, PARALLEL_COMPANIES, async (company) => {
    try {
      const result = await syncCompanyJobs(company.id, company.ats_type, company.ats_company_id)
      done++
      totalAdded   += result.addedCount
      totalUpdated += result.updatedCount
      results.push({ company: company.name, added: result.addedCount, updated: result.updatedCount, total: result.totalLive })
    } catch (err: any) {
      failed++
      done++
      results.push({ company: company.name, error: err.message })
      console.error(`[ats-sync-all] sync error for ${company.name}:`, err.message)
    }
    // Push progress after every company — Realtime delivers this to the client
    await supabase.from('sync_sessions').update({ done, failed, added: totalAdded, updated: totalUpdated, results }).eq('id', sessionId)
  })

  await supabase.from('sync_sessions').update({
    status: 'done', done, failed, added: totalAdded, updated: totalUpdated, results,
    finished_at: new Date().toISOString(),
  }).eq('id', sessionId)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const { preview, selectedJobUrls } = body

    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, ats_type, ats_company_id, logo_initial')
      .not('ats_type', 'is', null)
      .not('ats_company_id', 'is', null)

    if (!companies || companies.length === 0) {
      return NextResponse.json({ companiesChecked: 0, totalAdded: 0, message: 'No companies with ATS integration found' })
    }

    // ── PREVIEW MODE ──
    if (preview) {
      const allPreviewJobs: any[] = []
      await runInBatches(companies, PARALLEL_COMPANIES, async (company) => {
        try {
          const jobs = await fetchJobsFromAts(company.ats_type, company.ats_company_id)
          const { data: existingJobs } = await supabase
            .from('jobs').select('job_url').eq('company_id', company.id)
          const existingUrls = new Set(
            (existingJobs || []).map(j => j.job_url).filter(Boolean).map(jobDedupeKey)
          )
          for (const job of jobs) {
            allPreviewJobs.push({
              ...job,
              companyId: company.id, companyName: company.name,
              companyInitial: company.logo_initial, atsType: company.ats_type,
              isExisting: existingUrls.has(jobDedupeKey(job.jobUrl)),
            })
          }
        } catch (err: any) {
          console.error(`[ats-sync-all] preview error for ${company.name}:`, err.message)
        }
      })
      return NextResponse.json({ preview: true, jobs: allPreviewJobs, totalFound: allPreviewJobs.length, companiesChecked: companies.length })
    }

    // ── SYNC MODE ──
    const urlsByCompany = new Map<string, string[]>()
    if (selectedJobUrls && Array.isArray(selectedJobUrls)) {
      for (const item of selectedJobUrls) {
        const list = urlsByCompany.get(item.companyId) || []
        list.push(item.jobUrl)
        urlsByCompany.set(item.companyId, list)
      }
    }
    const companiesToSync = selectedJobUrls
      ? companies.filter(c => urlsByCompany.has(c.id))
      : companies

    // Create session row and return sessionId immediately.
    // after() runs the actual sync after the response is flushed — the client
    // gets sessionId fast, mounts the progress bar, and subscribes via Realtime
    // before the first update arrives.
    const { data: session, error: sessionError } = await supabase
      .from('sync_sessions')
      .insert({ total: companiesToSync.length, done: 0, failed: 0, added: 0, updated: 0, results: [] })
      .select('id')
      .single()

    if (sessionError || !session) {
      console.error('[ats-sync-all] failed to create session:', sessionError)
      return NextResponse.json({ error: 'Failed to create sync session' }, { status: 500 })
    }

    after(runSync(session.id, companiesToSync))

    return NextResponse.json({ sessionId: session.id, total: companiesToSync.length })
  } catch (error: any) {
    console.error('[ats-sync-all] error:', error)
    return NextResponse.json({ error: 'Bulk sync failed' }, { status: 500 })
  }
}

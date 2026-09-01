import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { fetchJobsFromAts } from '@/lib/ats-sync'
import { jobDedupeKey } from '@/lib/job-identity'

export const maxDuration = 60

// This was the root cause of "delete non-existing jobs not working":
// 1. It called fetch('/api/ats-sync') in a sequential for-loop — N HTTP round-trips
//    that could time out on Vercel before finishing all companies.
// 2. It compared raw job_url strings instead of normalized dedupe keys, so
//    URLs with different tracking params or trailing slashes never matched,
//    making every job look "stale" even when it still existed.
// Both are fixed here.

const PARALLEL_COMPANIES = 3
const COMPANY_TIMEOUT_MS = 30_000

async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map(fn))
    for (const r of batchResults) {
      if (r.status === 'fulfilled') results.push(r.value)
    }
  }
  return results
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const { preview, jobIds } = body

    // Fast path: client already has the stale job IDs from the preview step,
    // so skip the expensive ATS re-fetch and delete directly.
    if (!preview && Array.isArray(jobIds) && jobIds.length > 0) {
      const { createClient } = await import('@supabase/supabase-js')
      const freshClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      const CHUNK = 500
      for (let i = 0; i < jobIds.length; i += CHUNK) {
        await freshClient.from('live_application_queue').delete().in('job_id', jobIds.slice(i, i + CHUNK))
      }
      let deleteError: any = null
      for (let i = 0; i < jobIds.length; i += CHUNK) {
        const { error } = await freshClient.from('jobs').delete().in('id', jobIds.slice(i, i + CHUNK))
        if (error) { deleteError = error; break }
      }
      if (deleteError) {
        console.error('[cleanup-jobs] delete error:', deleteError)
        return NextResponse.json({ error: `Failed to delete stale jobs: ${deleteError.message}` }, { status: 500 })
      }
      return NextResponse.json({
        deletedCount: jobIds.length,
        message: `Deleted ${jobIds.length} jobs that no longer exist on company portals`,
      })
    }

    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, ats_type, ats_company_id, logo_initial')
      .not('ats_type', 'is', null)
      .not('ats_company_id', 'is', null)

    if (!companies || companies.length === 0) {
      return NextResponse.json({ staleJobs: [], message: 'No companies with ATS integration found' })
    }

    const allStaleJobs: any[] = []

    await runInBatches(companies, PARALLEL_COMPANIES, async (company) => {
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timed out after ${COMPANY_TIMEOUT_MS / 1000}s`)), COMPANY_TIMEOUT_MS)
        )
        const liveJobs = await Promise.race([fetchJobsFromAts(company.ats_type, company.ats_company_id), timeout])
        const liveUrlSet = new Set(
          liveJobs.map(j => jobDedupeKey(j.jobUrl)).filter(Boolean)
        )
        const { data: dbJobs } = await supabase
          .from('jobs')
          .select('id, title, job_url, company_name, location, type')
          .eq('company_id', company.id)
          .not('job_url', 'is', null)
          .neq('job_url', '')
        for (const dbJob of dbJobs || []) {
          if (!liveUrlSet.has(jobDedupeKey(dbJob.job_url))) {
            allStaleJobs.push({
              id: dbJob.id, title: dbJob.title, jobUrl: dbJob.job_url,
              companyName: dbJob.company_name || company.name, location: dbJob.location, type: dbJob.type,
            })
          }
        }
      } catch (err: any) {
        console.error(`[cleanup-jobs] error for ${company.name}:`, err.message)
      }
    })

    if (preview) {
      return NextResponse.json({ staleJobs: allStaleJobs, totalFound: allStaleJobs.length })
    }

    if (allStaleJobs.length === 0) {
      return NextResponse.json({ deletedCount: 0, message: 'No stale jobs found' })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const freshClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const idsToDelete = allStaleJobs.map(j => j.id)
    const CHUNK = 500
    for (let i = 0; i < idsToDelete.length; i += CHUNK) {
      await freshClient.from('live_application_queue').delete().in('job_id', idsToDelete.slice(i, i + CHUNK))
    }
    let deleteError: any = null
    for (let i = 0; i < idsToDelete.length; i += CHUNK) {
      const { error } = await freshClient.from('jobs').delete().in('id', idsToDelete.slice(i, i + CHUNK))
      if (error) { deleteError = error; break }
    }
    if (deleteError) {
      console.error('[cleanup-jobs] delete error:', deleteError)
      return NextResponse.json({ error: `Failed to delete stale jobs: ${deleteError.message}` }, { status: 500 })
    }
    return NextResponse.json({
      deletedCount: idsToDelete.length,
      message: `Deleted ${idsToDelete.length} jobs that no longer exist on company portals`,
    })
  } catch (error: any) {
    console.error('[cleanup-jobs] error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}

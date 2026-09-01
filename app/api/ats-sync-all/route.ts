import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { fetchJobsFromAts, syncCompanyJobs } from '@/lib/ats-sync'
import { jobDedupeKey } from '@/lib/job-identity'

export const maxDuration = 60

// Max companies to sync in parallel. Higher = faster but more memory/CPU.
// ATS APIs have their own rate limits so keep this conservative.
const PARALLEL_COMPANIES = 3

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
    // Fetch all live jobs from all ATS companies in parallel batches.
    // Old code: sequential for-loop with fetch() to itself = N HTTP round-trips.
    // New code: direct function calls in parallel batches = no network overhead.
    if (preview) {
      const allPreviewJobs: any[] = []

      await runInBatches(companies, PARALLEL_COMPANIES, async (company) => {
        try {
          const jobs = await fetchJobsFromAts(company.ats_type, company.ats_company_id)

          // Get existing URLs for this company to mark new vs existing
          const { data: existingJobs } = await supabase
            .from('jobs')
            .select('job_url')
            .eq('company_id', company.id)
          const existingUrls = new Set(
            (existingJobs || []).map(j => j.job_url).filter(Boolean).map(jobDedupeKey)
          )

          for (const job of jobs) {
            allPreviewJobs.push({
              ...job,
              companyId: company.id,
              companyName: company.name,
              companyInitial: company.logo_initial,
              atsType: company.ats_type,
              isExisting: existingUrls.has(jobDedupeKey(job.jobUrl)),
            })
          }
        } catch (err: any) {
          console.error(`[ats-sync-all] preview error for ${company.name}:`, err.message)
        }
      })

      return NextResponse.json({
        preview: true,
        jobs: allPreviewJobs,
        totalFound: allPreviewJobs.length,
        companiesChecked: companies.length,
      })
    }

    // ── SYNC MODE ──
    // Group selected URLs by company, then sync each company in parallel batches.
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

    let totalAdded = 0, totalUpdated = 0
    const results: any[] = []

    await runInBatches(companiesToSync, PARALLEL_COMPANIES, async (company) => {
      try {
        const result = await syncCompanyJobs(company.id, company.ats_type, company.ats_company_id)
        totalAdded   += result.addedCount
        totalUpdated += result.updatedCount
        results.push({ company: company.name, added: result.addedCount, updated: result.updatedCount, total: result.totalLive })
      } catch (err: any) {
        console.error(`[ats-sync-all] sync error for ${company.name}:`, err.message)
        results.push({ company: company.name, error: err.message })
      }
    })

    return NextResponse.json({
      companiesChecked: companiesToSync.length,
      totalAdded,
      totalUpdated,
      results,
      message: `Added ${totalAdded} new jobs, updated ${totalUpdated} existing jobs across ${companiesToSync.length} companies`,
    })
  } catch (error: any) {
    console.error('[ats-sync-all] error:', error)
    return NextResponse.json({ error: 'Bulk sync failed' }, { status: 500 })
  }
}

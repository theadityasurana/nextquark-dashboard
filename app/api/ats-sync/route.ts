import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { fetchJobsFromAts, syncCompanyJobs } from '@/lib/ats-sync'
import { jobDedupeKey } from '@/lib/job-identity'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()
    const { companyId, atsType, atsCompanyId: rawAtsCompanyId, preview, selectedJobUrls } = body
    const atsCompanyId = rawAtsCompanyId?.trim()

    if (!companyId || !atsType || !atsCompanyId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    let jobs: any[]
    try {
      jobs = await fetchJobsFromAts(atsType, atsCompanyId)
    } catch (err: any) {
      return NextResponse.json({ error: `Failed to fetch from ${atsType} API: ${err.message}` }, { status: 500 })
    }

    if (preview) {
      const { data: existingJobs } = await supabase
        .from('jobs')
        .select('job_url')
        .eq('company_id', companyId)
      const existingUrls = new Set(
        (existingJobs || []).map(j => j.job_url).filter(Boolean).map(jobDedupeKey)
      )
      return NextResponse.json({
        preview: true,
        totalFound: jobs.length,
        jobs: jobs.map(job => ({
          title: job.title, location: job.location, jobUrl: job.jobUrl,
          type: job.type, salaryRange: job.salaryRange, experience: job.experience,
          departments: job.departments,
          isExisting: existingUrls.has(jobDedupeKey(job.jobUrl)),
        })),
      })
    }

    if (jobs.length === 0) {
      return NextResponse.json({ addedCount: 0, totalFound: 0, message: 'No jobs found from ATS API' })
    }

    // For selective sync, filter first then run the full sync
    // (syncCompanyJobs handles deduplication internally)
    if (selectedJobUrls && Array.isArray(selectedJobUrls)) {
      const selectedSet = new Set(selectedJobUrls)
      jobs = jobs.filter(job => selectedSet.has(job.jobUrl))
    }

    const result = await syncCompanyJobs(companyId, atsType, atsCompanyId)

    return NextResponse.json({
      addedCount: result.addedCount,
      updatedCount: result.updatedCount,
      totalFound: result.totalLive,
      message: `Added ${result.addedCount} new jobs, updated ${result.updatedCount} existing jobs from ${atsType}`,
    })
  } catch (error) {
    console.error('ATS sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

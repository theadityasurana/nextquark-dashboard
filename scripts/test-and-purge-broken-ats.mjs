/**
 * test-and-purge-broken-ats.mjs
 *
 * 1. Fetches all ATS-configured companies from Supabase
 * 2. Tests each ATS endpoint directly (no HTTP round-trip through Next.js)
 * 3. Prints a clear pass/fail table
 * 4. Hard-deletes broken companies + all their jobs + queue entries
 * 5. Runs a live end-to-end cron test on the surviving companies:
 *    - schedule-sync  → populates job_sync_queue
 *    - process-sync   → runs actual ATS sync (add new + delete stale)
 *    - cleanup-jobs   → explicit stale-job sweep
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const BASE_URL = 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ATS_URLS = {
  greenhouse:      id => `https://boards-api.greenhouse.io/v1/boards/${id}/jobs`,
  lever:           id => `https://api.lever.co/v0/postings/${id}?mode=json`,
  ashby:           id => `https://api.ashbyhq.com/posting-api/job-board/${id}`,
  smartrecruiters: id => `https://api.smartrecruiters.com/v1/companies/${id}/postings`,
}

// ── helpers ──────────────────────────────────────────────────────────────────

function ok(msg)    { console.log(`  ✅  ${msg}`) }
function fail(msg)  { console.log(`  ❌  ${msg}`) }
function info(msg)  { console.log(`  ℹ️   ${msg}`) }
function header(msg){ console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`) }

async function testAts(atsType, atsCompanyId) {
  const urlFn = ATS_URLS[atsType]
  if (!urlFn) return { ok: false, status: null, error: `Unknown ATS type: ${atsType}` }
  const url = urlFn(atsCompanyId)
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` }
    const data = await res.json()
    // Count jobs from the response
    const jobs =
      data.jobs ?? data.postings ?? data.results ?? data.content ??
      (Array.isArray(data) ? data : [])
    return { ok: true, status: res.status, jobCount: jobs.length }
  } catch (err) {
    return { ok: false, status: null, error: err.message }
  }
}

async function hardDeleteCompany(company) {
  // 1. Get all job IDs for this company
  const { data: jobs } = await supabase
    .from('jobs').select('id').eq('company_id', company.id)
  const jobIds = (jobs || []).map(j => j.id)

  // 2. Delete live_application_queue rows (FK on job_id and company_id)
  if (jobIds.length > 0) {
    await supabase.from('live_application_queue').delete().in('job_id', jobIds)
  }
  await supabase.from('live_application_queue').delete().eq('company_id', company.id)

  // 3. Delete job_sync_queue entries
  await supabase.from('job_sync_queue').delete().eq('company_id', company.id)

  // 4. Delete performance_metrics (references company_name)
  if (company.name) {
    await supabase.from('performance_metrics').delete().eq('company_name', company.name)
  }

  // 5. Delete jobs (cascade should handle it but be explicit)
  if (jobIds.length > 0) {
    await supabase.from('jobs').delete().in('id', jobIds)
  }

  // 6. Delete the company itself
  const { error } = await supabase.from('companies').delete().eq('id', company.id)
  return error
}

async function callCron(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

async function callCleanup(preview) {
  const res = await fetch(`${BASE_URL}/api/cleanup-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preview }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

// ── main ─────────────────────────────────────────────────────────────────────

header('STEP 1 — Fetch all ATS-configured companies')

const { data: companies, error: fetchErr } = await supabase
  .from('companies')
  .select('id, name, ats_type, ats_company_id')
  .not('ats_type', 'is', null)
  .not('ats_company_id', 'is', null)

if (fetchErr || !companies?.length) {
  console.error('Failed to fetch companies:', fetchErr?.message ?? 'none found')
  process.exit(1)
}

info(`Found ${companies.length} ATS-configured companies`)

// ── STEP 2: Test every ATS endpoint ──────────────────────────────────────────

header('STEP 2 — Testing ATS endpoints')

const results = await Promise.all(
  companies.map(async c => {
    const result = await testAts(c.ats_type, c.ats_company_id)
    return { company: c, ...result }
  })
)

const passing = results.filter(r => r.ok)
const broken  = results.filter(r => !r.ok)

console.log('\n  Company                        ATS Type         Status')
console.log('  ' + '─'.repeat(58))
for (const r of results) {
  const name    = r.company.name.padEnd(30)
  const atsType = r.company.ats_type.padEnd(16)
  const status  = r.ok
    ? `✅  ${r.jobCount} jobs`
    : `❌  ${r.error}`
  console.log(`  ${name} ${atsType} ${status}`)
}

console.log(`\n  Passing: ${passing.length}  |  Broken: ${broken.length}`)

if (broken.length === 0) {
  ok('All ATS endpoints are healthy — nothing to delete.')
} else {
  // ── STEP 3: Hard-delete broken companies ───────────────────────────────────

  header(`STEP 3 — Hard-deleting ${broken.length} broken companies`)

  for (const r of broken) {
    const c = r.company
    process.stdout.write(`  Deleting ${c.name} (${c.ats_type}:${c.ats_company_id}) … `)
    const err = await hardDeleteCompany(c)
    if (err) {
      console.log(`FAILED: ${err.message}`)
    } else {
      console.log('done')
    }
  }

  ok(`Deleted ${broken.length} broken companies and all their data`)
}

// ── STEP 4: Cron end-to-end test on surviving companies ──────────────────────

if (passing.length === 0) {
  header('STEP 4 — Cron test SKIPPED (no healthy companies remain)')
  process.exit(0)
}

header(`STEP 4 — Cron end-to-end test (${passing.length} healthy companies)`)

// 4a. schedule-sync
process.stdout.write('  [schedule-sync] Scheduling companies … ')
const schedRes = await callCron('/api/cron/schedule-sync')
if (schedRes.status === 200) {
  console.log(`done — ${schedRes.body.scheduled ?? '?'} companies queued`)
  ok(schedRes.body.message)
} else {
  console.log(`FAILED (HTTP ${schedRes.status})`)
  fail(JSON.stringify(schedRes.body))
}

// Give the DB a moment to commit
await new Promise(r => setTimeout(r, 500))

// 4b. process-sync — runs the actual ATS sync
process.stdout.write('  [process-sync]  Running sync batch … ')
const syncRes = await callCron('/api/cron/process-sync')
if (syncRes.status === 200) {
  console.log(`done`)
  ok(syncRes.body.message)
  if (syncRes.body.entryIds?.length) {
    info(`Processing entry IDs: ${syncRes.body.entryIds.join(', ')}`)
  }
} else {
  console.log(`FAILED (HTTP ${syncRes.status})`)
  fail(JSON.stringify(syncRes.body))
}

// Wait for the after() background sync to finish (up to 60s)
info('Waiting 60s for background sync to complete …')
await new Promise(r => setTimeout(r, 60_000))

// 4c. Check sync results
const { data: syncQueue } = await supabase
  .from('job_sync_queue')
  .select('company_id, status, result')
  .in('status', ['done', 'failed'])
  .order('synced_at', { ascending: false })
  .limit(passing.length * 2)

if (syncQueue?.length) {
  const companyMap = new Map(companies.map(c => [c.id, c.name]))
  console.log('\n  Sync results:')
  for (const entry of syncQueue) {
    const name = companyMap.get(entry.company_id) ?? entry.company_id
    if (entry.status === 'done') {
      const r = entry.result ?? {}
      ok(`${name}: +${r.addedCount ?? 0} added, ~${r.updatedCount ?? 0} updated, -${r.deletedCount ?? 0} deleted`)
    } else {
      fail(`${name}: ${entry.result?.error ?? 'unknown error'}`)
    }
  }
}

// 4d. cleanup-jobs — explicit stale sweep
process.stdout.write('\n  [cleanup-jobs]  Preview stale jobs … ')
const previewRes = await callCleanup(true)
if (previewRes.status === 200) {
  const count = previewRes.body.staleJobs?.length ?? 0
  console.log(`done — ${count} stale jobs found`)
  if (count > 0) {
    process.stdout.write('  [cleanup-jobs]  Deleting stale jobs … ')
    const deleteRes = await callCleanup(false)
    if (deleteRes.status === 200) {
      console.log('done')
      ok(deleteRes.body.message)
    } else {
      console.log(`FAILED (HTTP ${deleteRes.status})`)
      fail(JSON.stringify(deleteRes.body))
    }
  } else {
    ok('No stale jobs — all synced jobs are live')
  }
} else {
  console.log(`FAILED (HTTP ${previewRes.status})`)
  fail(JSON.stringify(previewRes.body))
}

// 4e. watchdog
process.stdout.write('\n  [watchdog]      Running watchdog … ')
const wdRes = await callCron('/api/cron/watchdog')
if (wdRes.status === 200) {
  console.log('done')
  ok(`Reset ${wdRes.body.resetJobs ?? 0} stuck jobs, ${wdRes.body.resetSyncs ?? 0} stuck syncs`)
} else {
  console.log(`FAILED (HTTP ${wdRes.status})`)
  fail(JSON.stringify(wdRes.body))
}

header('DONE')
ok(`${passing.length} healthy companies remain with working ATS sync`)
ok(`${broken.length} broken companies hard-deleted`)

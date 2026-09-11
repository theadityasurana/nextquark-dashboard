// Test for Workday jobs API — requires CSRF token from the career page
// Usage: node scripts/test-workday.mjs

const TEST_CASES = [
  { company: 'NVIDIA',     tenant: 'nvidia',     wdNum: 5, board: 'NVIDIAExternalCareerSite' },
  { company: 'Salesforce', tenant: 'salesforce', wdNum: 1, board: 'External_Career_Site' },
  { company: 'Workday',    tenant: 'workday',    wdNum: 1, board: 'Workday' },
]

async function getWorkdayToken(tenant, wdNum, board) {
  const pageUrl = `https://${tenant}.wd${wdNum}.myworkdayjobs.com/en-US/${board}`
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
  })
  if (!res.ok) throw new Error(`Page fetch HTTP ${res.status}`)
  const html = await res.text()
  const match = html.match(/token:\s*"([^"]+)"/)
  if (!match) throw new Error('CSRF token not found in page')
  return match[1]
}

async function fetchWorkdayJobs(tenant, wdNum, board, token) {
  const url = `https://${tenant}.wd${wdNum}.myworkdayjobs.com/wday/cxs/${tenant}/${board}/jobs`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Origin': `https://${tenant}.wd${wdNum}.myworkdayjobs.com`,
      'Referer': `https://${tenant}.wd${wdNum}.myworkdayjobs.com/en-US/${board}`,
      'X-Calypso-CSRF-Token': token,
    },
    body: JSON.stringify({ limit: 5, offset: 0, searchText: '', appliedFacets: {} }),
  })
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  return res.json()
}

for (const { company, tenant, wdNum, board } of TEST_CASES) {
  process.stdout.write(`\n[${company}] ${tenant}.wd${wdNum}.myworkdayjobs.com / board: ${board}\n`)
  try {
    const token = await getWorkdayToken(tenant, wdNum, board)
    console.log(`  token: ${token}`)
    const data = await fetchWorkdayJobs(tenant, wdNum, board, token)
    const jobs = data.jobPostings || []
    console.log(`  ✅ total: ${data.total ?? '?'}, returned: ${jobs.length}`)
    if (jobs[0]) {
      const j = jobs[0]
      console.log(`  first job: "${j.title}"`)
      console.log(`  location:  ${j.locationsText || '(none)'}`)
      console.log(`  path:      ${j.externalPath || '(none)'}`)
      console.log(`  keys:      ${Object.keys(j).join(', ')}`)
    }
  } catch (e) {
    console.log(`  ❌ ${e.message}`)
  }
}

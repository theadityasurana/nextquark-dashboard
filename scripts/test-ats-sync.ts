import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { syncCompanyJobs } from '../lib/ats-sync'

config({ path: '.env.local' })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const COMPANY_ID = '2e10dbee-e91f-4b46-b993-1290710acb14' // Lovable (Ashby, small board)

async function main() {
  const { count: before } = await sb.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', COMPANY_ID)
  console.log('Jobs before:', before)

  const result = await syncCompanyJobs(COMPANY_ID, 'ashby', 'lovable')
  console.log('Result:', JSON.stringify(result, null, 2))

  const { count: after } = await sb.from('jobs').select('*', { count: 'exact', head: true }).eq('company_id', COMPANY_ID)
  console.log('Jobs after:', after)
}

main().catch(console.error)

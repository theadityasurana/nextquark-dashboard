import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const sql = `
-- Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_initial TEXT NOT NULL DEFAULT '',
  logo_url TEXT,
  website TEXT NOT NULL DEFAULT '',
  careers_url TEXT NOT NULL DEFAULT '',
  linkedin_url TEXT,
  description TEXT,
  industry TEXT NOT NULL DEFAULT 'Technology',
  size TEXT NOT NULL DEFAULT 'Unknown',
  location TEXT NOT NULL DEFAULT 'Remote',
  portal_type TEXT NOT NULL DEFAULT 'Custom',
  portal_status TEXT NOT NULL DEFAULT 'active',
  total_jobs INTEGER NOT NULL DEFAULT 0,
  apps_today INTEGER NOT NULL DEFAULT 0,
  success_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_time TEXT NOT NULL DEFAULT '-',
  added_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create jobs table
CREATE TABLE IF NOT EXISTS public.jobs (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_initial TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Remote',
  type TEXT NOT NULL DEFAULT 'Full-time',
  salary_range TEXT NOT NULL DEFAULT 'Not specified',
  experience TEXT NOT NULL DEFAULT 'Not specified',
  portal_url TEXT NOT NULL DEFAULT '',
  job_url TEXT NOT NULL DEFAULT '',
  company_website TEXT,
  company_linkedin TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  total_apps INTEGER NOT NULL DEFAULT 0,
  right_swipes INTEGER NOT NULL DEFAULT 0,
  success_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  avg_time TEXT NOT NULL DEFAULT '-',
  posted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (idempotent)
DROP POLICY IF EXISTS "Allow full access to companies" ON public.companies;
DROP POLICY IF EXISTS "Allow full access to jobs" ON public.jobs;

-- Allow full access for admin dashboard
CREATE POLICY "Allow full access to companies" ON public.companies
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to jobs" ON public.jobs
  FOR ALL USING (true) WITH CHECK (true);
`

async function run() {
  console.log('Creating tables...')
  const { error } = await supabase.rpc('exec_sql', { query: sql }).maybeSingle()
  
  if (error) {
    // If exec_sql RPC doesn't exist, try using the REST SQL endpoint
    console.log('RPC not available, trying direct fetch...')
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    })
    
    if (!res.ok) {
      // Fall back to running SQL via the management API
      console.log('Falling back to Supabase SQL API...')
      const sqlRes = await fetch(`${supabaseUrl}/pg/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ query: sql }),
      })
      
      if (!sqlRes.ok) {
        console.log('Direct SQL execution not available via API.')
        console.log('Please run the SQL from scripts/001_create_tables.sql in your Supabase SQL Editor.')
        console.log('The SQL has been printed below for convenience:')
        console.log('---')
        console.log(sql)
        console.log('---')
        return
      }
      const sqlData = await sqlRes.json()
      console.log('Tables created successfully via SQL API!', sqlData)
      return
    }
    
    const data = await res.json()
    console.log('Tables created successfully via RPC!', data)
    return
  }
  
  console.log('Tables created successfully!')
}

run().catch(console.error)

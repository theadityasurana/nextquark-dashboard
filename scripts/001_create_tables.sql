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

-- Disable RLS for admin dashboard (this is an admin-only app)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Allow full access for all authenticated and anon users (admin dashboard)
CREATE POLICY "Allow full access to companies" ON public.companies
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to jobs" ON public.jobs
  FOR ALL USING (true) WITH CHECK (true);

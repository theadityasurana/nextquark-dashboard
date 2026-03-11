-- COMBINED MIGRATION: Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/widujxpahzlpegzjjpqp/sql
-- This script is safe to run multiple times (idempotent)

-- Drop existing tables to start fresh (remove this if you have data you want to keep)
DROP TABLE IF EXISTS public.jobs CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;

-- Create companies table
CREATE TABLE public.companies (
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

-- Create jobs table (company_id is NULLABLE, all new columns included)
CREATE TABLE public.jobs (
  id TEXT PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
  requirements JSONB DEFAULT '[]'::jsonb,
  skills JSONB DEFAULT '[]'::jsonb,
  benefits JSONB DEFAULT '[]'::jsonb,
  detailed_requirements TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe for re-runs)
DROP POLICY IF EXISTS "Allow full access to companies" ON public.companies;
DROP POLICY IF EXISTS "Allow full access to jobs" ON public.jobs;

-- Allow full access (admin dashboard)
CREATE POLICY "Allow full access to companies" ON public.companies
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow full access to jobs" ON public.jobs
  FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (safe for re-runs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read of company logos'
  ) THEN
    CREATE POLICY "Allow public read of company logos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'company-logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow public upload of company logos'
  ) THEN
    CREATE POLICY "Allow public upload of company logos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'company-logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow public update of company logos'
  ) THEN
    CREATE POLICY "Allow public update of company logos"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'company-logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Allow public delete of company logos'
  ) THEN
    CREATE POLICY "Allow public delete of company logos"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'company-logos');
  END IF;
END $$;

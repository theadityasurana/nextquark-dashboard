-- Migration 002: Add missing columns and fix constraints
-- Run this in the Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/widujxpahzlpegzjjpqp/sql

-- 1. Add missing JSONB/TEXT columns to jobs table for requirements, skills, benefits, detailed_requirements
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS requirements JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS benefits JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS detailed_requirements TEXT DEFAULT '';

-- 2. Make company_id nullable (so jobs can be added without a company)
ALTER TABLE public.jobs ALTER COLUMN company_id DROP NOT NULL;

-- 3. Create a storage bucket for company logos (if it doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Allow public access to company logos
CREATE POLICY "Allow public read of company logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

CREATE POLICY "Allow public upload of company logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "Allow public update of company logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'company-logos');

CREATE POLICY "Allow public delete of company logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'company-logos');

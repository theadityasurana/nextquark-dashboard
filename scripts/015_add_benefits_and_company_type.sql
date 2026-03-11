-- Add benefits and company_type columns to companies table
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS benefits TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS company_type TEXT DEFAULT 'Other';

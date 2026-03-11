-- Add ATS fields to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS ats_type TEXT,
ADD COLUMN IF NOT EXISTS ats_company_id TEXT;

-- Add comment
COMMENT ON COLUMN companies.ats_type IS 'ATS platform type: greenhouse, lever, ashby, workable, recruitee';
COMMENT ON COLUMN companies.ats_company_id IS 'Company identifier in the ATS system (e.g., stripe for Greenhouse)';

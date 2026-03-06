-- Drop and recreate live_application_queue table with correct schema
DROP TABLE IF EXISTS live_application_queue CASCADE;

CREATE TABLE live_application_queue (
  -- Primary fields
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  job_id TEXT NOT NULL REFERENCES jobs(id),
  
  -- Personal Information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  gender TEXT,
  phone TEXT NOT NULL,
  country_code TEXT,
  location TEXT NOT NULL,
  headline TEXT NOT NULL,
  bio TEXT NOT NULL,
  
  -- URLs
  resume_url TEXT NOT NULL,
  linkedin_url TEXT NOT NULL,
  github_url TEXT,
  
  -- Status fields
  veteran_status TEXT NOT NULL,
  disability_status TEXT NOT NULL,
  ethnicity TEXT NOT NULL,
  work_authorization_status TEXT,
  
  -- Skills
  skills TEXT[] NOT NULL DEFAULT '{}',
  top_skills TEXT[] NOT NULL DEFAULT '{}',
  
  -- Experience (JSONB)
  experience JSONB NOT NULL DEFAULT '[]',
  
  -- Education (JSONB)
  education JSONB NOT NULL DEFAULT '[]',
  
  -- Certifications (JSONB)
  certifications JSONB NOT NULL DEFAULT '[]',
  
  -- Achievements (JSONB)
  achievements JSONB NOT NULL DEFAULT '[]',
  
  -- Job Preferences
  job_preferences JSONB NOT NULL DEFAULT '[]',
  work_mode_preferences TEXT[] NOT NULL DEFAULT '{}',
  
  -- Salary
  salary_currency TEXT NOT NULL DEFAULT 'USD',
  salary_min INTEGER,
  salary_max INTEGER,
  
  -- Other preferences
  desired_roles TEXT[] NOT NULL DEFAULT '{}',
  preferred_cities TEXT[] NOT NULL DEFAULT '{}',
  work_professions TEXT[] NOT NULL DEFAULT '{}',
  
  -- Job details
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_url TEXT NOT NULL,
  
  -- Application status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Metadata
  onboarding_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Cover letter
  cover_letter TEXT
);

-- Create indexes
CREATE INDEX idx_live_queue_user_id ON live_application_queue(user_id);
CREATE INDEX idx_live_queue_job_id ON live_application_queue(job_id);
CREATE INDEX idx_live_queue_status ON live_application_queue(status);
CREATE INDEX idx_live_queue_created_at ON live_application_queue(created_at DESC);

-- Enable RLS
ALTER TABLE live_application_queue ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enable read access for all users" ON live_application_queue
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users" ON live_application_queue
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON live_application_queue
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete for authenticated users" ON live_application_queue
  FOR DELETE USING (true);

-- Create live_application_queue table
CREATE TABLE IF NOT EXISTS live_application_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  role_title TEXT NOT NULL,
  job_url TEXT,
  
  -- Bio data fields
  phone TEXT,
  location TEXT,
  experience TEXT,
  education JSONB,
  skills TEXT[],
  
  -- PDF storage reference
  resume_pdf_path TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT DEFAULT 'pending'
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_live_queue_company ON live_application_queue(company_name);
CREATE INDEX IF NOT EXISTS idx_live_queue_applicant_email ON live_application_queue(applicant_email);
CREATE INDEX IF NOT EXISTS idx_live_queue_created_at ON live_application_queue(created_at DESC);

-- Enable RLS
ALTER TABLE live_application_queue ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for authenticated users
CREATE POLICY "Allow authenticated users to view live queue"
  ON live_application_queue
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert into live queue"
  ON live_application_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update live queue"
  ON live_application_queue
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

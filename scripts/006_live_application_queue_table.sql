-- Create live_application_queue table
CREATE TABLE IF NOT EXISTS live_application_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  user_location TEXT NOT NULL,
  company_id TEXT NOT NULL,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  agent_id TEXT,
  progress_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 0,
  step_description TEXT,
  started_at TEXT,
  duration TEXT,
  created_at TEXT NOT NULL,
  screenshot TEXT,
  created_at_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_live_queue_status ON live_application_queue(status);
CREATE INDEX IF NOT EXISTS idx_live_queue_user_id ON live_application_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_live_queue_company_id ON live_application_queue(company_id);
CREATE INDEX IF NOT EXISTS idx_live_queue_agent_id ON live_application_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_live_queue_created_at ON live_application_queue(created_at_timestamp);

-- Enable RLS (Row Level Security)
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

-- Insert mock data
INSERT INTO live_application_queue (
  id, user_id, user_name, user_email, user_phone, user_location,
  company_id, company_name, job_title, job_id, status, agent_id,
  progress_step, total_steps, step_description, started_at, duration,
  created_at, screenshot
) VALUES (
  'A-7821', 'u1', 'Aditya S.', 'mail.adityasurana@gmail.com', '+91 7776004343', 'San Francisco, CA',
  'c1', 'CRED', 'Sr. Software Engineer', 'G-001', 'processing', 'Agent-01',
  3, 5, 'Filling personal details', '10:45:18', '2m 15s',
  '2m ago', 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22 fill=%22%23666%22%3EJob Application Portal%3C/text%3E%3C/svg%3E'
);

INSERT INTO live_application_queue (
  id, user_id, user_name, user_email, user_phone, user_location,
  company_id, company_name, job_title, job_id, status, agent_id,
  progress_step, total_steps, step_description, started_at, duration,
  created_at, screenshot
) VALUES (
  'A-7822', 'u1', 'Aditya S.', 'mail.adityasurana@gmail.com', '+91 7776004343', 'San Francisco, CA',
  'c2', 'Meta', 'Product Manager', 'M-045', 'queued', NULL,
  0, 5, 'Waiting in queue', NULL, NULL,
  '1m ago', NULL
);

INSERT INTO live_application_queue (
  id, user_id, user_name, user_email, user_phone, user_location,
  company_id, company_name, job_title, job_id, status, agent_id,
  progress_step, total_steps, step_description, started_at, duration,
  created_at, screenshot
) VALUES (
  'A-7823', 'u2', 'Sarah M.', 'sarah.miller@email.com', '+1 415-555-0123', 'New York, NY',
  'c3', 'Apple', 'UX Designer', 'A-128', 'completed', 'Agent-03',
  5, 5, 'Application submitted', '09:30:45', '8m 32s',
  '30s ago', NULL
);

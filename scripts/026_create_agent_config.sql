-- Create agent_config table
CREATE TABLE IF NOT EXISTS agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Agent Settings
  max_concurrent_agents INTEGER DEFAULT 5,
  max_retries INTEGER DEFAULT 3,
  retry_delay_seconds INTEGER DEFAULT 300,
  page_load_timeout_seconds INTEGER DEFAULT 30,
  form_submit_timeout_seconds INTEGER DEFAULT 60,
  portal_response_timeout_seconds INTEGER DEFAULT 120,
  
  -- Priority Rules
  priority_rules JSONB DEFAULT '{"company": [], "jobType": [], "userTier": []}',
  
  -- Working Hours
  working_hours_enabled BOOLEAN DEFAULT false,
  working_hours_start TIME DEFAULT '09:00:00',
  working_hours_end TIME DEFAULT '18:00:00',
  working_hours_timezone TEXT DEFAULT 'UTC',
  
  -- Rate Limiting
  rate_limit_enabled BOOLEAN DEFAULT true,
  rate_limit_delay_seconds INTEGER DEFAULT 60,
  rate_limit_per_company INTEGER DEFAULT 5,
  
  -- Auto-pause
  auto_pause_enabled BOOLEAN DEFAULT true,
  auto_pause_error_threshold REAL DEFAULT 0.5,
  
  -- Portal Settings
  portal_settings JSONB DEFAULT '{}',
  
  -- Browser Settings
  browser_user_agent TEXT DEFAULT 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  browser_viewport_width INTEGER DEFAULT 1920,
  browser_viewport_height INTEGER DEFAULT 1080,
  browser_headless BOOLEAN DEFAULT true,
  
  -- Proxy Settings
  proxy_enabled BOOLEAN DEFAULT false,
  proxy_rotation_enabled BOOLEAN DEFAULT false,
  proxy_locations TEXT[] DEFAULT '{}',
  
  -- Application Behavior
  auto_fill_preferences JSONB DEFAULT '{"personalInfo": true, "workExperience": true, "education": true, "skills": true}',
  cover_letter_generation_enabled BOOLEAN DEFAULT true,
  resume_selection_strategy TEXT DEFAULT 'default',
  screening_questions_strategy TEXT DEFAULT 'conservative',
  auto_upload_documents BOOLEAN DEFAULT true,
  
  -- Follow-up Actions
  auto_send_thank_you BOOLEAN DEFAULT false,
  auto_send_connection_request BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config
INSERT INTO agent_config (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON agent_config FOR SELECT USING (true);
CREATE POLICY "Enable update for all users" ON agent_config FOR UPDATE USING (true);

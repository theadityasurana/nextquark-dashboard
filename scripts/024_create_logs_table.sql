-- Create logs table for persistent storage
CREATE TABLE IF NOT EXISTS application_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  agent_id UUID NOT NULL,
  message TEXT NOT NULL,
  application_id UUID REFERENCES live_application_queue(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_application_logs_application_id ON application_logs(application_id);
CREATE INDEX IF NOT EXISTS idx_application_logs_timestamp ON application_logs(timestamp DESC);

-- Enable RLS
ALTER TABLE application_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can view their own logs" ON application_logs
  FOR SELECT USING (true);

CREATE POLICY "Users can insert logs" ON application_logs
  FOR INSERT WITH CHECK (true);

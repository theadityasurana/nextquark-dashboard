-- Create performance_metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES live_application_queue(id),
  
  -- Metrics
  metric_type TEXT NOT NULL, -- 'success_rate', 'processing_time', 'error', 'throughput'
  metric_value REAL,
  metric_data JSONB DEFAULT '{}',
  
  -- Dimensions
  portal_type TEXT,
  company_name TEXT,
  job_role TEXT,
  error_reason TEXT,
  
  -- Timestamps
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE DEFAULT CURRENT_DATE,
  hour INTEGER DEFAULT EXTRACT(HOUR FROM NOW())
);

CREATE INDEX idx_performance_metrics_type ON performance_metrics(metric_type);
CREATE INDEX idx_performance_metrics_date ON performance_metrics(date);
CREATE INDEX idx_performance_metrics_portal ON performance_metrics(portal_type);
CREATE INDEX idx_performance_metrics_company ON performance_metrics(company_name);

-- Enable RLS
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON performance_metrics FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON performance_metrics FOR INSERT WITH CHECK (true);

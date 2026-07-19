-- Add sync tracking columns to companies
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'never' CHECK (sync_status IN ('never', 'success', 'failed', 'running'));

-- Create job sync queue table
CREATE TABLE IF NOT EXISTS job_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  synced_at timestamptz,
  result jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status_scheduled ON job_sync_queue(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_company ON job_sync_queue(company_id);

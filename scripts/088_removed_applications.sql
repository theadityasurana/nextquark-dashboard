-- Migration: keep a copy of every application the system deletes.
-- application_logs cascade-deletes with the queue row, so a deletion's reason and
-- the row itself would otherwise be gone, and a wrong deletion unrecoverable.

CREATE TABLE IF NOT EXISTS removed_applications (
  id UUID PRIMARY KEY,
  removed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  company_name TEXT,
  job_title TEXT,
  job_url TEXT,
  row_data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_removed_applications_at ON removed_applications (removed_at DESC);
ALTER TABLE removed_applications ENABLE ROW LEVEL SECURITY;

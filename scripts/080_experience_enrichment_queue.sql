-- Queue for jobs that need LLM-based experience classification.
-- Populated by sync-companies after each company sync.
-- Drained by enrich-experience edge function in small batches.
CREATE TABLE IF NOT EXISTS experience_enrichment_queue (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  job_title  text NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts   int  NOT NULL DEFAULT 0,
  result     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_queue_status ON experience_enrichment_queue(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_queue_job_id ON experience_enrichment_queue(job_id);

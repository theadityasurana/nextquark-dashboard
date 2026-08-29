-- Migration: critical database indexes
-- Without these, every filtered query does a full table scan.
-- At 100k rows, unindexed queries on live_application_queue take 5+ seconds.

-- live_application_queue: the most queried table
CREATE INDEX IF NOT EXISTS idx_laq_status          ON live_application_queue (status);
CREATE INDEX IF NOT EXISTS idx_laq_created_at      ON live_application_queue (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_laq_user_id         ON live_application_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_laq_job_id          ON live_application_queue (job_id);
CREATE INDEX IF NOT EXISTS idx_laq_status_created  ON live_application_queue (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_laq_started_at      ON live_application_queue (started_at) WHERE status = 'processing';

-- jobs: filtered by company_id and status constantly
CREATE INDEX IF NOT EXISTS idx_jobs_company_id     ON jobs (company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status         ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at     ON jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_job_url        ON jobs (job_url) WHERE job_url IS NOT NULL AND job_url != '';

-- job_sync_queue: cron picks pending rows ordered by scheduled_at
CREATE INDEX IF NOT EXISTS idx_jsq_status_scheduled ON job_sync_queue (status, scheduled_at ASC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_jsq_company_id       ON job_sync_queue (company_id);

-- application_logs: ordered by timestamp, filtered by application_id
CREATE INDEX IF NOT EXISTS idx_logs_timestamp      ON application_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_application_id ON application_logs (application_id);

-- portal_metrics: filtered by timestamp and portal_type
CREATE INDEX IF NOT EXISTS idx_portal_metrics_ts   ON portal_metrics (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_portal_metrics_type ON portal_metrics (portal_type, timestamp DESC);

-- profiles: ordered by total_apps
CREATE INDEX IF NOT EXISTS idx_profiles_total_apps ON profiles (total_apps DESC NULLS LAST);

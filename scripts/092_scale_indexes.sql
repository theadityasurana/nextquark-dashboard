-- Migration 092: indexes for the dashboard's hot queries.
--
-- The dashboard now pages, counts and filters in Postgres instead of downloading
-- whole tables. These indexes keep those queries index-only/cheap as the tables
-- grow. All are IF NOT EXISTS and CONCURRENTLY, so they are safe to run on a live
-- database (run each statement on its own; CONCURRENTLY can't run in a transaction).

-- application_logs: health-check counts (last 15 min), per-run timelines, feed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_logs_timestamp      ON application_logs (timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_logs_app_timestamp  ON application_logs (application_id, timestamp);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_logs_level_ts       ON application_logs (level, timestamp DESC);

-- live_application_queue: status counts, paged tabs, per-user filter, date ranges.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_created           ON live_application_queue (created_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_status_created    ON live_application_queue (status, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_user              ON live_application_queue (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_pending_premium   ON live_application_queue (is_premium) WHERE status = 'pending';

-- Substring search (ILIKE '%term%') on names/titles.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_name_trgm     ON companies USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_created       ON companies (created_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_title_trgm         ON jobs USING gin (title gin_trgm_ops);

-- jobs: per-company lists and newest-first paging.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_company_created    ON jobs (company_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_created            ON jobs (created_at DESC, id DESC);

-- removed_applications: outreach looks rows up by the user inside row_data.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_removed_user            ON removed_applications ((row_data->>'user_id'));

-- Overview: portal metrics (24h) and recent sync results.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portal_metrics_ts       ON portal_metrics (timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_sync_status_synced  ON job_sync_queue (status, synced_at DESC);

-- application_answers: Learning's "most reused" list sorted the whole table and
-- hit the statement timeout.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_answers_times_used      ON application_answers (times_used DESC) WHERE times_used > 1;

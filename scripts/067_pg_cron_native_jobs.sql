-- Migration: move cleanup-rejected, watchdog, and schedule-sync to pure SQL pg_cron
-- These three do nothing but read/write Supabase tables, so they don't need to
-- round-trip through a Next.js API route at all.
--
-- process-sync and job-summary still run via Vercel cron (they call external
-- ATS APIs and the push notification route respectively).
--
-- Run in the Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ─── 1. cleanup-rejected ────────────────────────────────────────────────────
-- Deletes queue entries rejected more than 24 hours ago.
-- Was: Vercel cron → GET /api/cron/cleanup-rejected → DELETE query
-- Now: pure SQL, runs daily at 02:00 UTC

SELECT cron.unschedule('cleanup-rejected') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-rejected'
);

SELECT cron.schedule(
  'cleanup-rejected',
  '0 2 * * *',
  $$
  DELETE FROM live_application_queue
  WHERE rejected_at IS NOT NULL
    AND rejected_at < NOW() - INTERVAL '24 hours';
  $$
);

-- ─── 2. watchdog ────────────────────────────────────────────────────────────
-- Resets jobs stuck in 'processing' for >15 min back to 'completed',
-- resets syncs stuck in 'running' for >20 min back to 'pending',
-- and reconciles the distributed concurrency gate.
-- Was: Vercel cron → GET /api/cron/watchdog → several queries
-- Now: pure SQL, runs every 15 minutes

SELECT cron.unschedule('watchdog') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'watchdog'
);

SELECT cron.schedule(
  'watchdog',
  '*/15 * * * *',
  $$
  -- 1. Move stuck processing jobs to completed
  UPDATE live_application_queue
  SET
    status       = 'completed',
    completed_at = NOW()
  WHERE status != 'completed'
    AND created_at < NOW() - INTERVAL '15 minutes';

  -- 2. Reset stuck running syncs back to pending
  UPDATE job_sync_queue
  SET status = 'pending'
  WHERE status = 'running'
    AND synced_at < NOW() - INTERVAL '20 minutes';

  -- 3. Reset company sync_status for those stuck syncs
  UPDATE companies
  SET sync_status = 'pending'
  WHERE id IN (
    SELECT company_id FROM job_sync_queue
    WHERE status = 'pending'
      AND synced_at < NOW() - INTERVAL '20 minutes'
  );

  -- 4. Reconcile the distributed concurrency gate
  UPDATE kernel_concurrency_gate
  SET
    active_count = (
      SELECT COUNT(*) FROM live_application_queue WHERE status = 'processing'
    ),
    updated_at = NOW()
  WHERE id = 'singleton';
  $$
);

-- ─── 3. schedule-sync ───────────────────────────────────────────────────────
-- Populates job_sync_queue once per day, spreading companies evenly across 24h.
-- Was: Vercel cron → GET /api/cron/schedule-sync → delete + insert queries
-- Now: pure SQL, runs daily at 00:00 UTC

SELECT cron.unschedule('schedule-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'schedule-sync'
);

SELECT cron.schedule(
  'schedule-sync',
  '0 0 * * *',
  $$
  -- Remove stale pending entries before re-scheduling
  DELETE FROM job_sync_queue WHERE status = 'pending';

  -- Re-insert one entry per ATS-configured company, spread evenly across 24h
  INSERT INTO job_sync_queue (company_id, scheduled_at, status)
  SELECT
    id AS company_id,
    NOW() + (
      INTERVAL '24 hours'
      * (ROW_NUMBER() OVER (ORDER BY id) - 1)::float
      / NULLIF(COUNT(*) OVER (), 0)
    ) AS scheduled_at,
    'pending' AS status
  FROM companies
  WHERE ats_type IS NOT NULL
    AND ats_company_id IS NOT NULL;
  $$
);

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

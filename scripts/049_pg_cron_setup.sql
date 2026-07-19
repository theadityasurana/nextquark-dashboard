-- Run this in the Supabase SQL editor after running 048_job_sync_queue.sql
-- Requires pg_cron and pg_net extensions (both available on Supabase)

-- Enable extensions if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Schedule the queue population job: runs every day at midnight UTC
SELECT cron.schedule(
  'schedule-job-sync',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://admin.nextquark.in/api/cron/schedule-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2. Schedule the queue processor: runs every 30 minutes
SELECT cron.schedule(
  'process-job-sync',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://admin.nextquark.in/api/cron/process-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- To verify scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule if needed:
-- SELECT cron.unschedule('schedule-job-sync');
-- SELECT cron.unschedule('process-job-sync');

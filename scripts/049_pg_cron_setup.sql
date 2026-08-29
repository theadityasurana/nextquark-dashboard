-- Migration: pg_cron setup for job sync
-- Run this in the Supabase SQL editor.
-- Requires pg_cron and pg_net extensions (both available on Supabase Pro+).
--
-- NOTE: If you are on Vercel, the crons in vercel.json now handle schedule-sync
-- and process-sync automatically. You only need this SQL if you want Supabase
-- to call the endpoints independently (e.g. as a backup, or on a non-Vercel host).
--
-- Replace YOUR_DOMAIN with your actual deployment URL.
-- Replace YOUR_CRON_SECRET with the value of your CRON_SECRET env var.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Populate the sync queue once per day at midnight UTC
SELECT cron.schedule(
  'schedule-job-sync',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/schedule-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 2. Process the sync queue every 30 minutes
SELECT cron.schedule(
  'process-job-sync',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/process-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 3. Watchdog: reset stuck jobs every 15 minutes
SELECT cron.schedule(
  'watchdog',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/watchdog',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- To verify scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule if needed:
-- SELECT cron.unschedule('schedule-job-sync');
-- SELECT cron.unschedule('process-job-sync');
-- SELECT cron.unschedule('watchdog');

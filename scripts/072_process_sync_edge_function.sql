-- Migration: re-point process-sync to Supabase Edge Function
-- Vercel's after() is not guaranteed to execute on cold starts or under load.
-- The Edge Function keeps the event loop alive so each ATS sync actually runs.
-- Run in the Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('process-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-sync'
);

-- Runs every 30 minutes — picks up to 5 pending companies and triggers their sync
SELECT cron.schedule(
  'process-sync',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://widujxpahzlpegzjjpqp.supabase.co/functions/v1/sync-companies',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer 520548687dab80b53126f1e2936afbfb7b796d3e61da7b97b6429781532c0ba8"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Verify:
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'process-sync';

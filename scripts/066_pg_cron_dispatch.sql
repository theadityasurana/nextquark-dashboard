-- Migration: pg_cron dispatch job
-- Calls /api/cron/dispatch every minute so pending applications are picked up
-- server-side even when no browser tab is open.
--
-- Requires pg_cron and pg_net (both available on Supabase Pro+).
-- Run in the Supabase SQL editor.
--
-- Replace YOUR_DOMAIN with your deployment URL (e.g. nextquark-dashboard.vercel.app).
-- Replace YOUR_CRON_SECRET with the value of your CRON_SECRET env var.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule first so re-running this migration is safe
SELECT cron.unschedule('dispatch-applications') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'dispatch-applications'
);

SELECT cron.schedule(
  'dispatch-applications',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_DOMAIN/api/cron/dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Verify:
-- SELECT * FROM cron.job WHERE jobname = 'dispatch-applications';

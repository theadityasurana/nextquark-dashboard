-- Migration: re-point dispatch to Supabase Edge Function
-- The Edge Function keeps the event loop alive so fire-and-forget calls to
-- /api/auto-apply-queue are NOT dropped (unlike Vercel serverless functions).
--
-- Replace YOUR_PROJECT_REF with your Supabase project ref (found in project URL).
-- Replace YOUR_CRON_SECRET with the value of your CRON_SECRET env var.
-- Run in the Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── 1. Re-schedule the per-minute dispatch cron ────────────────────────────

SELECT cron.unschedule('dispatch-applications') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'dispatch-applications'
);

SELECT cron.schedule(
  'dispatch-applications',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://widujxpahzlpegzjjpqp.supabase.co/functions/v1/dispatch-applications',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer 520548687dab80b53126f1e2936afbfb7b796d3e61da7b97b6429781532c0ba8"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- ─── 2. Re-point the instant insert trigger ──────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_dispatch_on_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM net.http_post(
      url     := 'https://widujxpahzlpegzjjpqp.supabase.co/functions/v1/dispatch-applications',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer 520548687dab80b53126f1e2936afbfb7b796d3e61da7b97b6429781532c0ba8'
      ),
      body    := '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger already exists from migration 068 — recreating it picks up the new function body.
DROP TRIGGER IF EXISTS dispatch_on_queue_insert ON live_application_queue;

CREATE TRIGGER dispatch_on_queue_insert
  AFTER INSERT ON live_application_queue
  FOR EACH ROW EXECUTE FUNCTION trigger_dispatch_on_insert();

-- ─── Verify ──────────────────────────────────────────────────────────────────
-- SELECT * FROM cron.job WHERE jobname = 'dispatch-applications';

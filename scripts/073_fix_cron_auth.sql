-- Migration: fix pg_cron auth (use service role JWT + x-cron-secret)
-- Uses $cron$ delimiter instead of $$ to avoid conflicts with JWT dots.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── process-sync ────────────────────────────────────────────────────────────
SELECT cron.unschedule('process-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process-sync'
);

SELECT cron.schedule(
  'process-sync',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://widujxpahzlpegzjjpqp.supabase.co/functions/v1/sync-companies',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZHVqeHBhaHpscGVnempqcHFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc1MjY2MiwiZXhwIjoyMDg3MzI4NjYyfQ.6KGHcAofT7nFX03JII8yLiEagZfOXWY_0YbEepEf55M","x-cron-secret":"520548687dab80b53126f1e2936afbfb7b796d3e61da7b97b6429781532c0ba8"}'::jsonb,
    body    := '{}'::jsonb
  );
  $cron$
);

-- ─── dispatch-applications ───────────────────────────────────────────────────
SELECT cron.unschedule('dispatch-applications') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'dispatch-applications'
);

SELECT cron.schedule(
  'dispatch-applications',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://widujxpahzlpegzjjpqp.supabase.co/functions/v1/dispatch-applications',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZHVqeHBhaHpscGVnempqcHFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc1MjY2MiwiZXhwIjoyMDg3MzI4NjYyfQ.6KGHcAofT7nFX03JII8yLiEagZfOXWY_0YbEepEf55M","x-cron-secret":"520548687dab80b53126f1e2936afbfb7b796d3e61da7b97b6429781532c0ba8"}'::jsonb,
    body    := '{}'::jsonb
  );
  $cron$
);

-- ─── insert trigger ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_dispatch_on_insert()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM net.http_post(
      url     := 'https://widujxpahzlpegzjjpqp.supabase.co/functions/v1/dispatch-applications',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'Authorization',  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpZHVqeHBhaHpscGVnempqcHFwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc1MjY2MiwiZXhwIjoyMDg3MzI4NjYyfQ.6KGHcAofT7nFX03JII8yLiEagZfOXWY_0YbEepEf55M',
        'x-cron-secret',  '520548687dab80b53126f1e2936afbfb7b796d3e61da7b97b6429781532c0ba8'
      ),
      body := '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS dispatch_on_queue_insert ON live_application_queue;
CREATE TRIGGER dispatch_on_queue_insert
  AFTER INSERT ON live_application_queue
  FOR EACH ROW EXECUTE FUNCTION trigger_dispatch_on_insert();

-- Verify:
-- SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

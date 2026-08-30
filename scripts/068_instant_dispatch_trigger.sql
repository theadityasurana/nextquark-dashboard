-- Migration: instant dispatch trigger
-- Fires net.http_post to /api/cron/dispatch immediately when a new pending
-- row is inserted into live_application_queue, so auto-apply starts without
-- waiting for the next pg_cron tick.
--
-- Requires pg_net (enabled on Supabase Pro+).
-- Run in the Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_dispatch_on_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM net.http_post(
      url     := 'https://nextquark-dashboard.vercel.app/api/cron/dispatch',
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

DROP TRIGGER IF EXISTS dispatch_on_queue_insert ON live_application_queue;

CREATE TRIGGER dispatch_on_queue_insert
  AFTER INSERT ON live_application_queue
  FOR EACH ROW EXECUTE FUNCTION trigger_dispatch_on_insert();

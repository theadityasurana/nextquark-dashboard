-- Migration: a single server-side dispatcher, atomic claims and leases.
--
-- Before this, four things could start the same row: a browser-tab timer, a
-- pg_cron edge function, an insert trigger, and a manual click. None of them
-- claimed the row atomically, and the concurrency counter in
-- kernel_concurrency_gate leaked whenever a function was killed. It sat at 3/3
-- from 2 Sep, so every run waited out a 2-minute timeout before failing open.
--
-- Now a row holding a live lease IS a running application. There is no counter
-- to drift: a crashed worker's slot frees itself when its lease expires.

-- 1. `blocked` was written by preflight but rejected by this constraint, so the
--    row silently stayed `pending` and was re-dispatched forever.
ALTER TABLE live_application_queue DROP CONSTRAINT IF EXISTS live_application_queue_status_check;
ALTER TABLE live_application_queue ADD CONSTRAINT live_application_queue_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'awaiting_otp', 'awaiting_captcha', 'blocked'));

-- 2. Lease and retry-backoff columns.
ALTER TABLE live_application_queue
  ADD COLUMN IF NOT EXISTS lease_owner      TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_laq_dispatch ON live_application_queue (is_premium DESC, created_at ASC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_laq_leased ON live_application_queue (lease_expires_at)
  WHERE lease_owner IS NOT NULL;

-- 3. Claim up to the free slots. Only a worker calls this; it honours the
--    dashboard toggles, so Auto Start and Concurrency take effect immediately.
CREATE OR REPLACE FUNCTION claim_applications(p_worker TEXT, p_lease_seconds INT DEFAULT 300)
RETURNS TABLE (id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prefs JSONB;
  cap INT;
  slots INT;
BEGIN
  SELECT ui_preferences INTO prefs FROM settings LIMIT 1;
  IF COALESCE((prefs->>'autoStart')::BOOLEAN, FALSE) IS NOT TRUE THEN RETURN; END IF;
  cap := COALESCE((prefs->>'maxConcurrent')::INT, 5);

  -- Serialises claimers, so two workers cannot both see the same free slot.
  PERFORM pg_advisory_xact_lock(hashtext('claim_applications'));

  SELECT cap - COUNT(*) INTO slots FROM live_application_queue q
    WHERE q.lease_owner IS NOT NULL AND q.lease_expires_at > now();
  IF slots <= 0 THEN RETURN; END IF;

  RETURN QUERY
  UPDATE live_application_queue q
     SET status = 'processing', started_at = now(), attempt_count = COALESCE(q.attempt_count, 0) + 1,
         lease_owner = p_worker, lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         next_attempt_at = NULL
   WHERE q.id IN (
     SELECT c.id FROM live_application_queue c
      WHERE c.status = 'pending'
        AND (c.next_attempt_at IS NULL OR c.next_attempt_at <= now())
        AND (COALESCE((prefs->>'premiumOnly')::BOOLEAN, FALSE) IS NOT TRUE OR c.is_premium)
      ORDER BY c.is_premium DESC NULLS LAST, c.created_at ASC
      LIMIT slots
      FOR UPDATE SKIP LOCKED)
  RETURNING q.id;
END;
$$;

-- 4. Claim one specific row for a manual Start. Respects the cap, ignores Auto Start.
CREATE OR REPLACE FUNCTION claim_application(p_id UUID, p_worker TEXT, p_lease_seconds INT DEFAULT 300)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cap INT;
  claimed UUID;
BEGIN
  SELECT COALESCE((ui_preferences->>'maxConcurrent')::INT, 5) INTO cap FROM settings LIMIT 1;
  PERFORM pg_advisory_xact_lock(hashtext('claim_applications'));
  IF (SELECT COUNT(*) FROM live_application_queue q
       WHERE q.lease_owner IS NOT NULL AND q.lease_expires_at > now()) >= cap THEN
    RETURN FALSE;
  END IF;
  UPDATE live_application_queue q
     SET status = 'processing', started_at = now(), attempt_count = COALESCE(q.attempt_count, 0) + 1,
         lease_owner = p_worker, lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         next_attempt_at = NULL
   WHERE q.id = p_id AND q.status IN ('pending', 'failed', 'blocked')
         AND (q.lease_owner IS NULL OR q.lease_expires_at <= now())
  RETURNING q.id INTO claimed;
  RETURN claimed IS NOT NULL;
END;
$$;

-- 5. Keep a running application's lease alive.
CREATE OR REPLACE FUNCTION renew_application_lease(p_id UUID, p_worker TEXT, p_lease_seconds INT DEFAULT 300)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE live_application_queue SET lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   WHERE id = p_id AND lease_owner = p_worker;
  RETURN FOUND;
END;
$$;

-- 6. Return rows from a dead worker to the queue, or fail them once out of tries.
CREATE OR REPLACE FUNCTION reclaim_expired_leases()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  UPDATE live_application_queue q
     SET status = CASE WHEN COALESCE(q.attempt_count, 0) >= COALESCE(q.max_attempts, 3) THEN 'failed' ELSE 'pending' END,
         last_error = 'Worker stopped mid-run; lease expired',
         lease_owner = NULL, lease_expires_at = NULL
   WHERE (q.lease_owner IS NOT NULL AND q.lease_expires_at <= now())
      OR (q.status = 'processing' AND q.lease_owner IS NULL);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- 7. Worker liveness, shown on the queue screen.
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  active INT NOT NULL DEFAULT 0
);
ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;

-- 8. Replaces one COUNT query per company on every /api/companies load.
CREATE OR REPLACE FUNCTION company_job_counts()
RETURNS TABLE (company_id TEXT, job_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT j.company_id::TEXT, COUNT(*) FROM jobs j WHERE j.company_id IS NOT NULL GROUP BY j.company_id;
$$;

-- 9. These are server-only. Functions in public are otherwise callable by anon.
REVOKE ALL ON FUNCTION claim_applications(TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION claim_application(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION renew_application_lease(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reclaim_expired_leases() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION company_job_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_applications(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_application(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION renew_application_lease(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION reclaim_expired_leases() TO service_role;
GRANT EXECUTE ON FUNCTION company_job_counts() TO service_role;

-- 10. Retire the old dispatchers: the worker is now the only one.
DROP TRIGGER IF EXISTS dispatch_on_queue_insert ON live_application_queue;
SELECT cron.unschedule('dispatch-applications')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-applications');

-- 11. The keep-alive ran the full /api/overview every 5 minutes, which alone was
--     the #6 and #7 most expensive statements in the database. Use a cheap route.
SELECT cron.alter_job(jobid, command := $cmd$SELECT net.http_get(url := 'https://admin.nextquark.in/api/live-queue/count');$cmd$)
  FROM cron.job WHERE jobname = 'keep-alive';

-- 12. The dashboard subscribed to this table, but it was never published, so no
--     event ever arrived and the screen only changed on a reload.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND tablename = 'live_application_queue') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_application_queue;
  END IF;
END $$;

-- 13. Retire the leaked counter's effect: nothing reads it after this release.
UPDATE kernel_concurrency_gate SET active_count = 0, updated_at = now() WHERE id = 'singleton';

-- 14. Earlier attempts failed on infrastructure (a dead Kernel key, the stuck
--     gate), not on the postings. Without this, rows at their limit would get a
--     single try. Only rows still waiting are touched.
UPDATE live_application_queue SET attempt_count = 0 WHERE status = 'pending';

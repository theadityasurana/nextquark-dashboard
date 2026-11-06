-- Migration: run one application per candidate at a time.
-- Runs waiting on a verification code hold their slot, so a candidate with a slow
-- inbox filled most of the concurrency cap and starved everyone else. And two
-- runs for one person at one company share an inbox and can take each other's code.

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
     SELECT d.id FROM (
       -- One per candidate: their oldest eligible application.
       SELECT DISTINCT ON (c.user_id) c.id, c.is_premium, c.created_at
         FROM live_application_queue c
        WHERE c.status = 'pending'
          AND (c.next_attempt_at IS NULL OR c.next_attempt_at <= now())
          AND (COALESCE((prefs->>'premiumOnly')::BOOLEAN, FALSE) IS NOT TRUE OR c.is_premium)
          -- The candidate has nothing running now.
          AND NOT EXISTS (
            SELECT 1 FROM live_application_queue a
             WHERE a.user_id = c.user_id AND a.lease_owner IS NOT NULL AND a.lease_expires_at > now())
          -- This job has not already gone through for them.
          AND NOT EXISTS (
            SELECT 1 FROM live_application_queue o
             WHERE o.id <> c.id AND o.user_id = c.user_id AND o.job_url = c.job_url AND o.status = 'completed')
        ORDER BY c.user_id, c.created_at ASC
     ) d
     ORDER BY d.is_premium DESC NULLS LAST, d.created_at ASC
     LIMIT slots)
  RETURNING q.id;
END;
$$;

REVOKE ALL ON FUNCTION claim_applications(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_applications(TEXT, INT) TO service_role;

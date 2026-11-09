-- Let one candidate run several applications at once, up to the dashboard's
-- concurrency limit. Previously claim_applications took at most one per
-- candidate and skipped any candidate with something already running, so a
-- queue that belonged to one person (or had a manual run going) never
-- auto-started beyond one at a time.
--
-- Slots are shared round-robin: each candidate's 1st eligible application
-- ranks before anyone's 2nd, so one person can't take every slot.
-- OTP safety: the inbound webhook and the run's own lookup match code emails
-- by company, so parallel runs for one candidate get the right code.
CREATE OR REPLACE FUNCTION public.claim_applications(p_worker text, p_lease_seconds integer DEFAULT 300)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       SELECT c.id, c.is_premium, c.created_at,
              -- Running applications count toward a candidate's turn, so the
              -- round-robin also accounts for what they already have going.
              ROW_NUMBER() OVER (PARTITION BY c.user_id ORDER BY c.created_at ASC)
                + (SELECT COUNT(*) FROM live_application_queue a
                    WHERE a.user_id = c.user_id AND a.lease_owner IS NOT NULL AND a.lease_expires_at > now()) AS turn
         FROM live_application_queue c
        WHERE c.status = 'pending'
          AND (c.next_attempt_at IS NULL OR c.next_attempt_at <= now())
          AND (COALESCE((prefs->>'premiumOnly')::BOOLEAN, FALSE) IS NOT TRUE OR c.is_premium)
          -- This job has not already gone through for them.
          AND NOT EXISTS (
            SELECT 1 FROM live_application_queue o
             WHERE o.id <> c.id AND o.user_id = c.user_id AND o.job_url = c.job_url AND o.status = 'completed')
          -- And is not running right now under another row for the same job.
          AND NOT EXISTS (
            SELECT 1 FROM live_application_queue r
             WHERE r.id <> c.id AND r.user_id = c.user_id AND r.job_url = c.job_url
               AND r.lease_owner IS NOT NULL AND r.lease_expires_at > now())
     ) d
     ORDER BY d.turn ASC, d.is_premium DESC NULLS LAST, d.created_at ASC
     LIMIT slots)
  RETURNING q.id;
END;
$function$;

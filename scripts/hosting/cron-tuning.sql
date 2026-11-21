-- Cut idle Vercel calls (2026-11-17). Undo: undo-cron-tuning.sql (local only, holds the cron secret).
CREATE OR REPLACE FUNCTION public.dispatch_has_work()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
           SELECT 1 FROM live_application_queue
            WHERE lease_owner IS NOT NULL AND lease_expires_at <= now())
      OR EXISTS (
           SELECT 1
             FROM (SELECT ui_preferences AS p FROM settings LIMIT 1) s
             JOIN live_application_queue c ON c.status = 'pending'
            WHERE COALESCE((s.p->>'autoStart')::boolean, false)
              AND (c.next_attempt_at IS NULL OR c.next_attempt_at <= now())
              AND (COALESCE((s.p->>'premiumOnly')::boolean, false) IS NOT TRUE OR c.is_premium));
$$;


-- 1. keep-alive did nothing useful.
SELECT cron.unschedule('keep-alive') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'keep-alive');

-- 2. dispatch only calls Vercel when claim_applications could claim something,
--    or a run's lease expired and reclaim_expired_leases has work.
DO $$
DECLARE r record; base text;
BEGIN
  SELECT jobid, command INTO r FROM cron.job WHERE jobname = 'dispatch-applications';
  base := regexp_replace(r.command, '\s*WHERE\s+public\.dispatch_has_work\(\)\s*;?\s*$', '', 'i');
  base := regexp_replace(base, ';\s*$', '');
  PERFORM cron.alter_job(r.jobid, command := base || ' WHERE public.dispatch_has_work();');
END $$;


-- 3. admin-notify every 5 minutes instead of every minute.
SELECT cron.alter_job(jobid, schedule := '*/5 * * * *') FROM cron.job WHERE jobname = 'admin-notify';

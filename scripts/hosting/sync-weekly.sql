-- Weekly sync rotation on the new Vercel project (2026-11-17).
-- Each night queue the ~1,400 companies synced longest ago, spread over 24h, so every
-- company comes round about once a week. Never-synced SmartRecruiters/Lever boards are
-- held back until a decision is made on them.
CREATE OR REPLACE FUNCTION public.schedule_company_sync(p_per_day int DEFAULT 1400)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  DELETE FROM job_sync_queue WHERE status = 'pending';
  INSERT INTO job_sync_queue (company_id, scheduled_at, status)
  SELECT c.id,
         now() + interval '24 hours' * (row_number() OVER (ORDER BY c.last_synced_at NULLS FIRST, c.id) - 1)::float
                 / GREATEST(count(*) OVER (), 1),
         'pending'
    FROM (SELECT id, last_synced_at FROM companies
           WHERE ats_type IS NOT NULL AND ats_company_id IS NOT NULL
             AND (last_synced_at IS NOT NULL OR ats_type IN ('greenhouse', 'ashby'))
           ORDER BY last_synced_at NULLS FIRST, id
           LIMIT p_per_day) c;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Scheduling now happens in SQL only; the Vercel scheduler (capped at 1,000 rows) is dropped.
SELECT cron.unschedule('schedule-job-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'schedule-job-sync');
SELECT cron.alter_job(jobid, command := 'SELECT public.schedule_company_sync(1400);') FROM cron.job WHERE jobname = 'schedule-sync';

-- Processing (40 per 30-min tick) runs on the new Vercel project, only when something is due.
SELECT cron.alter_job(jobid, command :=
  regexp_replace(regexp_replace(replace(command, 'https://admin.nextquark.in', 'https://nextquark-admin.vercel.app'), ';\s*$', ''), '\s*$', '')
  || ' WHERE EXISTS (SELECT 1 FROM public.job_sync_queue WHERE status = ''pending'' AND scheduled_at <= now());')
  FROM cron.job WHERE jobname = 'process-job-sync' AND command NOT LIKE '%job_sync_queue%';

-- Dispatch to the new project (Kernel key is set there now).
SELECT cron.alter_job(jobid, command := replace(command, 'https://admin.nextquark.in', 'https://nextquark-admin.vercel.app'))
  FROM cron.job WHERE jobname = 'dispatch-applications';

-- Start the rotation today instead of waiting for midnight.
SELECT public.schedule_company_sync(1400) AS queued_now;

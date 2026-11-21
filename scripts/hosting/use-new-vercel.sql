-- Point database crons and webhook triggers from https://admin.nextquark.in to https://nextquark-admin.vercel.app.
-- Sync crons (schedule-job-sync, process-job-sync) are deliberately left alone.
DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN SELECT jobid, command FROM cron.job
           WHERE jobname IN ('keep-alive','dispatch-applications','admin-notify') AND command LIKE '%https://admin.nextquark.in%'
  LOOP
    PERFORM cron.alter_job(r.jobid, command := replace(r.command, 'https://admin.nextquark.in', 'https://nextquark-admin.vercel.app'));
  END LOOP;
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('trigger_profile_created_webhook','trigger_application_submitted_webhook')
             AND p.prosrc LIKE '%https://admin.nextquark.in%'
  LOOP
    def := pg_get_functiondef(r.oid);
    EXECUTE replace(def, 'https://admin.nextquark.in', 'https://nextquark-admin.vercel.app');
  END LOOP;
END $$;

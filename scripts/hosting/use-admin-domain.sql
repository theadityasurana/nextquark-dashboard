-- Point database crons and webhook triggers from https://nextquark-admin.vercel.app to https://admin.nextquark.in.
-- Sync crons (schedule-job-sync, process-job-sync) are deliberately left alone.
DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN SELECT jobid, command FROM cron.job
           WHERE jobname IN ('keep-alive','dispatch-applications','admin-notify') AND command LIKE '%https://nextquark-admin.vercel.app%'
  LOOP
    PERFORM cron.alter_job(r.jobid, command := replace(r.command, 'https://nextquark-admin.vercel.app', 'https://admin.nextquark.in'));
  END LOOP;
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('trigger_profile_created_webhook','trigger_application_submitted_webhook')
             AND p.prosrc LIKE '%https://nextquark-admin.vercel.app%'
  LOOP
    def := pg_get_functiondef(r.oid);
    EXECUTE replace(def, 'https://nextquark-admin.vercel.app', 'https://admin.nextquark.in');
  END LOOP;
END $$;

-- Run once KERNEL_API_KEY is set on the new Vercel project.
SELECT cron.alter_job(jobid, command := replace(command, 'https://admin.nextquark.in', 'https://nextquark-admin.vercel.app'))
  FROM cron.job WHERE jobname = 'dispatch-applications';

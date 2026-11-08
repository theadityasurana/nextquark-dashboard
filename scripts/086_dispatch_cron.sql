-- Server-side automatic dispatch: pg_cron calls the Vercel dispatch route every
-- minute so pending applications start even when no local worker is running.
-- Replace <CRON_SECRET> with the value of the CRON_SECRET env var on Vercel.
select cron.schedule(
  'dispatch-applications',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://admin.nextquark.in/api/cron/dispatch',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <CRON_SECRET>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

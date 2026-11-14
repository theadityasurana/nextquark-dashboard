-- Admin desktop push notifications (work with the dashboard tab closed).
--
-- admin_push_subscriptions: Chrome web-push subscriptions of the admin's
--   browsers. Written by POST /api/notifications {action:"subscribe"}.
-- admin_notify_state: single row; cursor for signup/upgrade events and the
--   last Supabase health status, so each change is announced once.
-- cron "admin-notify": every minute POSTs to /api/cron/admin-notify. The
--   subscriptions travel in the request body (read here, inside Postgres) so a
--   push still goes out when PostgREST is the thing that's down.

create table if not exists public.admin_push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.admin_push_subscriptions enable row level security;

create table if not exists public.admin_notify_state (
  id int primary key default 1 check (id = 1),
  events_cursor timestamptz,
  health_status text,
  updated_at timestamptz not null default now()
);
alter table public.admin_notify_state enable row level security;
insert into public.admin_notify_state (id) values (1) on conflict (id) do nothing;

-- Reuse the CRON_SECRET bearer already stored in the dispatch job, so the
-- secret never has to be pasted into this file.
do $$
declare
  bearer text;
begin
  select substring(command from 'Bearer ([^"]+)"') into bearer
  from cron.job where jobname = 'dispatch-applications';
  if bearer is null then
    raise exception 'dispatch-applications cron job not found; cannot copy CRON_SECRET';
  end if;

  perform cron.unschedule(jobid) from cron.job where jobname = 'admin-notify';

  perform cron.schedule('admin-notify', '* * * * *', format($cmd$
    select net.http_post(
      url := 'https://admin.nextquark.in/api/cron/admin-notify',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer %s'),
      body := jsonb_build_object(
        'subscriptions',
        (select coalesce(jsonb_agg(subscription), '[]'::jsonb) from public.admin_push_subscriptions)
      ),
      timeout_milliseconds := 30000
    );
  $cmd$, bearer));
end $$;

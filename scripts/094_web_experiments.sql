-- Website-only A/B experiments (additive; the mobile app never reads these).
-- Edited from the nextquark dashboard (service role). Nothing here is readable by clients;
-- the website reads its settings and records assignments through /api/experiment.

create table if not exists public.web_experiments (
  key text primary key,
  enabled boolean not null default false,
  paywall_percent integer not null default 50 check (paywall_percent between 0 and 100),
  run text not null default 'run-1',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.web_experiments enable row level security;
insert into public.web_experiments (key) values ('paywall_after_first') on conflict (key) do nothing;

-- One row per user per experiment: which group they were put in, once, for good.
create table if not exists public.web_experiment_assignments (
  user_id uuid not null references auth.users (id) on delete cascade,
  experiment text not null,
  run text not null,
  variant text not null check (variant in ('paywall', 'control')),
  region text,
  assigned_at timestamptz not null default now(),
  paywall_seen_at timestamptz,
  primary key (user_id, experiment)
);
create index if not exists web_experiment_assignments_run_idx on public.web_experiment_assignments (experiment, run);
alter table public.web_experiment_assignments enable row level security;

-- Results per run and group. Payments = first Dodo subscription.active after assignment.
create or replace function public.web_experiment_results(p_experiment text)
returns table (
  run text, variant text, users bigint, applied bigint, saw_paywall bigint,
  paid bigint, paid_after_first bigint, avg_hours_to_pay numeric, revenue jsonb
)
language sql stable security definer set search_path = public as $$
  with a as (
    select * from web_experiment_assignments where experiment = p_experiment
  ),
  apps as (
    select q.user_id, count(*) as n, min(q.created_at) as first_at
    from live_application_queue q join a on a.user_id = q.user_id
    where q.created_at >= a.assigned_at - interval '1 day'
    group by q.user_id
  ),
  pay as (
    select distinct on (e.user_id) e.user_id, e.received_at,
      (e.payload -> 'data' ->> 'recurring_pre_tax_amount')::numeric / 100 as amt,
      coalesce(e.payload -> 'data' ->> 'currency', '?') as cur
    from web_billing_events e join a on a.user_id = e.user_id
    where e.event_type = 'subscription.active' and e.received_at >= a.assigned_at
    order by e.user_id, e.received_at
  ),
  rv as (
    select a.run, a.variant, p.cur, round(sum(p.amt), 2) as total
    from a join pay p on p.user_id = a.user_id group by 1, 2, 3
  ),
  rvj as (
    select run, variant, jsonb_object_agg(cur, total) as r from rv group by 1, 2
  )
  select a.run, a.variant,
    count(*),
    count(ap.user_id),
    count(a.paywall_seen_at),
    count(p.user_id),
    count(p.user_id) filter (where ap.first_at is not null and ap.first_at < p.received_at),
    round(avg(extract(epoch from p.received_at - a.assigned_at) / 3600)::numeric, 1),
    coalesce(max(rvj.r::text)::jsonb, '{}'::jsonb)
  from a
  left join apps ap on ap.user_id = a.user_id
  left join pay p on p.user_id = a.user_id
  left join rvj on rvj.run = a.run and rvj.variant = a.variant
  group by a.run, a.variant
  order by a.run desc, a.variant;
$$;
revoke all on function public.web_experiment_results(text) from public, anon, authenticated;

alter table public.web_experiments add column if not exists force_all boolean not null default false;

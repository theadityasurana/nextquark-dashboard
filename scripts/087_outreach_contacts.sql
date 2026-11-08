-- Sales & Outreach: one drafted WhatsApp message per user, plus whether the
-- founder has contacted them. Written only by the dashboard's service role.
create table if not exists public.outreach_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message text,
  model text,
  generated_at timestamptz,
  contacted boolean not null default false,
  contacted_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.outreach_contacts enable row level security;

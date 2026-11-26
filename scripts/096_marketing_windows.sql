-- Marketing "Live" panel with time windows (30 min … 90 days). Service role only.

-- Landing visits in a window, one row per city (for globe dots sized by count).
create or replace function public.marketing_visits_geo(p_since timestamptz)
returns table (lat double precision, lng double precision, country text, city text, n bigint)
language sql stable security definer set search_path = public as $$
  select avg(coalesce(gps_latitude, latitude)), avg(coalesce(gps_longitude, longitude)), country, city, count(*)
  from download_link_visits
  where created_at >= p_since and coalesce(gps_latitude, latitude) is not null
  group by country, city
  order by 5 desc
  limit 3000;
$$;

-- Users who did something in the app since p_since: a right swipe, or any profile write.
create or replace function public.marketing_active_users(p_since timestamptz)
returns table (user_id uuid)
language sql stable security definer set search_path = public as $$
  select user_id from live_application_queue where created_at >= p_since and user_id is not null
  union
  select id from profiles where updated_at >= p_since;
$$;

-- Latest visits list: allow windows up to 90 days.
create or replace function public.marketing_live_visitors(p_minutes integer)
returns table (lat double precision, lng double precision, country text, city text, host text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(gps_latitude, latitude), coalesce(gps_longitude, longitude), country, city, host, created_at
  from download_link_visits
  where created_at >= now() - make_interval(mins => greatest(1, least(p_minutes, 129600)))
    and coalesce(gps_latitude, latitude) is not null
  order by created_at desc
  limit 50;
$$;

revoke all on function public.marketing_visits_geo(timestamptz) from public, anon, authenticated;
revoke all on function public.marketing_active_users(timestamptz) from public, anon, authenticated;
revoke all on function public.marketing_live_visitors(integer) from public, anon, authenticated;

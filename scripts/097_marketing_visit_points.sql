-- One point per landing visit (GPS when allowed, else IP geo) for the dot globes. Service role only.
create or replace function public.marketing_visit_points(p_since timestamptz)
returns table (lat double precision, lng double precision, gps boolean)
language sql stable security definer set search_path = public as $$
  select round(coalesce(gps_latitude, latitude)::numeric, 3)::float8,
         round(coalesce(gps_longitude, longitude)::numeric, 3)::float8,
         gps_latitude is not null
  from download_link_visits
  where created_at >= p_since and coalesce(gps_latitude, latitude) is not null
  order by created_at desc
  limit 40000;
$$;
revoke all on function public.marketing_visit_points(timestamptz) from public, anon, authenticated;

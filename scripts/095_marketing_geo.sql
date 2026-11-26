-- Marketing page: traffic sources, city coordinates and live visitors (read-only helpers).
-- Service role only; called by the nextquark dashboard.

-- Where landing-page visits come from. Source = external referrer, else the in-app browser
-- in the user agent (Instagram/LinkedIn/X… often send no referrer), else "Direct / other".
create or replace function public.marketing_visit_sources(p_since timestamptz)
returns table (source text, host text, campaign text, country text, city text, visits bigint)
language sql stable security definer set search_path = public as $$
  select
    case
      when coalesce(user_agent,'') ~* 'Instagram' or lower(coalesce(referrer,'')) like '%instagram.%' then 'Instagram'
      when coalesce(user_agent,'') ~* 'LinkedInApp' or lower(coalesce(referrer,'')) ~ 'linkedin\.|lnkd\.in' then 'LinkedIn'
      when coalesce(user_agent,'') ~* 'FBAN|FBAV|FB_IAB' or lower(coalesce(referrer,'')) ~ '(//|\.)(facebook|fb)\.' then 'Facebook'
      when coalesce(user_agent,'') ~* 'Twitter' or lower(coalesce(referrer,'')) ~ '(//|\.)(t\.co|twitter\.com|x\.com)' then 'X / Twitter'
      when coalesce(user_agent,'') ~* 'WhatsApp' or lower(coalesce(referrer,'')) ~ 'whatsapp|wa\.me' then 'WhatsApp'
      when coalesce(user_agent,'') ~* 'Snapchat' then 'Snapchat'
      when lower(coalesce(referrer,'')) ~ 'youtube\.|youtu\.be' then 'YouTube'
      when lower(coalesce(referrer,'')) like '%reddit.%' then 'Reddit'
      when lower(coalesce(referrer,'')) ~ 'chatgpt\.|openai\.|perplexity\.|claude\.ai|gemini\.google' then 'AI assistants'
      when lower(coalesce(referrer,'')) ~ '(//|\.)google\.' then 'Google'
      when lower(coalesce(referrer,'')) ~ '(//|\.)(bing|duckduckgo|yahoo|yandex|baidu)\.' then 'Other search'
      when campaign = 'qr' then 'QR code'
      else 'Direct / other'
    end,
    coalesce(nullif(host, ''), '—'),
    nullif(campaign, ''),
    nullif(country, ''),
    nullif(city, ''),
    count(*)
  from download_link_visits
  where created_at >= p_since
  group by 1, 2, 3, 4, 5;
$$;

-- Average coordinates per city (and per country, city = null), learned from visit geo.
create or replace function public.marketing_city_coords()
returns table (country text, city text, lat double precision, lng double precision, n bigint)
language sql stable security definer set search_path = public as $$
  select country, city, avg(latitude), avg(longitude), count(*)
  from download_link_visits
  where latitude is not null and longitude is not null and country is not null
  group by grouping sets ((country, city), (country));
$$;

-- People on the landing pages in the last p_minutes.
create or replace function public.marketing_live_visitors(p_minutes integer)
returns table (lat double precision, lng double precision, country text, city text, host text, at timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(gps_latitude, latitude), coalesce(gps_longitude, longitude), country, city, host, created_at
  from download_link_visits
  where created_at >= now() - make_interval(mins => greatest(1, least(p_minutes, 1440)))
    and coalesce(gps_latitude, latitude) is not null
  order by created_at desc
  limit 500;
$$;

revoke all on function public.marketing_visit_sources(timestamptz) from public, anon, authenticated;
revoke all on function public.marketing_city_coords() from public, anon, authenticated;
revoke all on function public.marketing_live_visitors(integer) from public, anon, authenticated;

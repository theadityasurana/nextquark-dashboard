# Marketing analytics (Bangalore QR)

Ingest: `download.nextquark.in` `POST /api/track` (Cloudflare Pages, nextquark-links). Storage: `public.download_link_visits`. Admin: Marketing → Bangalore QR (read-only except optional `campaign_spots`).

## Product: one QR for Bangalore

Print **`https://download.nextquark.in/`** on every poster. No `?c=` required.

- The map shows **where the phone was** when they opened the page, not which physical poster.
- Default map: **heat clusters** (city-wide pattern).
- **Green pins** = `location_source = gps` (user tapped Allow on geolocation). **Purple** = IP only.
- KPI **GPS on map pins** is `%` of Bangalore-bbox pins that are GPS.
- Do not treat pins as exact poster placement. CARTO (`CARTO_API_KEY` on Vercel → `GET /api/map-basemap`) is the basemap only.

Download page (nextquark-links) should call `navigator.geolocation.getCurrentPosition` (timeout ~2.5s) before one `POST /api/track`. Track prefers GPS in the body, else Cloudflare IP.

## Advanced (hidden unless used)

If visits have a non-null `campaign` or `campaign_spots` rows exist, admin shows a collapsed **tagged campaigns (?c=)** section. That is optional multi-poster mode only.

## CARTO

Set **`CARTO_API_KEY`** on the nextquark-dashboard Vercel project (server). Do not put it in Supabase or require `NEXT_PUBLIC_CARTO_API_KEY`.

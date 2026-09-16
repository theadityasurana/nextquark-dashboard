# Marketing analytics (Download QR, global)

Ingest: `download.nextquark.in` `POST /api/track` (Cloudflare Pages, nextquark-links). Storage: `public.download_link_visits`. Admin: Marketing → **Download QR (global)**.

Print **`https://download.nextquark.in/`**. Map and tables are worldwide (no Bangalore bbox).

- Heat map (default) + pins: green = GPS, purple = IP. Map `fitBounds` to data.
- `place_source`: `gps_geocode` (GPS + reverse-geocoded address) · `gps_only` · `ip` (network, often inaccurate).
- Recent scans Loc column: GPS+address | GPS | IP.
- Accurate place data requires users to tap Allow on location when opening the QR link.
- Reverse geocode: BigDataCloud (when GPS is allowed). Disclose **location + reverse geocode** in the privacy policy.
- CARTO: `CARTO_API_KEY` on Vercel → `GET /api/map-basemap` (basemap only).

Tagged `?c=` / `campaign_spots` stay in collapsed Advanced if present.

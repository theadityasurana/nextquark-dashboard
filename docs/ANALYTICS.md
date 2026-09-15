# Marketing analytics (Download QR, global)

Ingest: `download.nextquark.in` `POST /api/track` (Cloudflare Pages, nextquark-links). Storage: `public.download_link_visits`. Admin: Marketing → **Download QR (global)**.

Print **`https://download.nextquark.in/`**. Map and tables are worldwide (no Bangalore bbox).

- Heat map (default) + pins: green = GPS, purple = IP. Map `fitBounds` to data.
- **Scans by country** and **Recent scans** use Cloudflare place fields (`country`, `city`, `locality`, `region`, `postal_code`). Country names via `Intl.DisplayNames`. These are approximate network geo; postal/PIN is not always present.
- KPI **GPS on map pins**.
- CARTO: `CARTO_API_KEY` on Vercel → `GET /api/map-basemap` (basemap only).

Tagged `?c=` / `campaign_spots` stay in collapsed Advanced if present.

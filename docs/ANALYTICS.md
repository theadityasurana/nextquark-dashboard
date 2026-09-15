# Marketing analytics (Bangalore QR)

Scan ingest lives on `download.nextquark.in` (`POST /api/track`). This dashboard is **read-only** against `download_link_visits`.

- **Campaign (`?c=`)** is ground truth for which physical poster was scanned.
- **Map pins** are Cloudflare IP estimates (~100 m–1 km). Do not expect them to sit on the exact poster. Do not swap basemaps to “fix” placement.

## CARTO basemap (admin app only)

The Bangalore QR map in Marketing uses CARTO raster `dark_all` tiles via Leaflet:

`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=<NEXT_PUBLIC_CARTO_API_KEY>`

### Operators

1. Set **`NEXT_PUBLIC_CARTO_API_KEY`** in **Vercel → Production** for the `nextquark-dashboard` project (not Preview-only).
2. Redeploy production after adding or rotating the key. `NEXT_PUBLIC_*` is inlined at build time.
3. Keep CARTO and OpenStreetMap attribution on the map.

If the key is missing, the map falls back to OpenStreetMap tiles (no CARTO watermark) so local/dev still works.

### Do not

- Commit the real key (use `.env.local` locally; it is gitignored).
- Put the key in Supabase, Cloudflare Pages, `nextquark-links`, or `index.html`.
- Hardcode the key in `components/bangalore-qr-map.tsx`.
- Change `download_link_visits` or `/api/download-analytics` for CARTO — analytics data is unrelated.

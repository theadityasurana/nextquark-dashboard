-- Poster ground-truth coordinates for Bangalore QR field ops.
-- campaign matches download_link_visits.campaign / ?c= slug.
-- latitude/longitude are where the physical QR was placed (set in admin), not IP geo.

CREATE TABLE IF NOT EXISTS public.campaign_spots (
  campaign text PRIMARY KEY,
  label text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_spots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.campaign_spots IS 'Admin-configured physical QR poster locations. Campaign slug is ground truth; lat/lng are placement coords, not Cloudflare IP.';

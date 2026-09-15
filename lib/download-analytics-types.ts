export type DownloadVisitPin = {
  id: string
  created_at: string
  campaign: string | null
  lat: number
  lng: number
  device_type: string | null
  location_source: string | null
  country: string | null
  city: string | null
  locality: string | null
  region: string | null
  postal_code: string | null
  continent: string | null
}

export type DownloadRecentVisit = {
  id: string
  created_at: string
  country: string | null
  city: string | null
  locality: string | null
  region: string | null
  postal_code: string | null
  continent: string | null
  location_source: string | null
  device_type: string | null
  lat: number | null
  lng: number | null
}

export type DownloadCountryStat = {
  country: string
  scans: number
}

export type DownloadCluster = {
  lat: number
  lng: number
  scans: number
  sample_campaign: string | null
}

export type DownloadPosterRow = {
  spot: string
  scans: number
  first_seen: string
  last_seen: string
  configured: boolean
  label: string | null
}

export type PosterMarker = {
  campaign: string
  label: string
  lat: number
  lng: number
  scans: number
  last_seen: string | null
  ip_centroid: { lat: number; lng: number } | null
}

export type CampaignSpotRow = {
  campaign: string
  label: string | null
  latitude: number
  longitude: number
  notes: string | null
  active: boolean
}

export type DownloadAnalyticsPayload = {
  kpis: { today: number; d7: number; d30: number; gps_pins: number; ip_pins: number }
  pins: DownloadVisitPin[]
  recentVisits: DownloadRecentVisit[]
  byCountry: DownloadCountryStat[]
  clusters: DownloadCluster[]
  posters: DownloadPosterRow[]
  posterMarkers: PosterMarker[]
  spots: CampaignSpotRow[]
  byHour: { hour: number; scans: number }[]
  daily: { day: string; scans: number }[]
  devices: { name: string; value: number }[]
  error: string | null
  spotsError: string | null
}

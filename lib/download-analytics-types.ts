export type DownloadVisitPin = {
  id: string
  created_at: string
  campaign: string | null
  lat: number
  lng: number
  device_type: string | null
  location_source: string | null
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

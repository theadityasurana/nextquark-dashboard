export type DownloadVisitPin = {
  id: string
  created_at: string
  campaign: string | null
  lat: number
  lng: number
  device_type: string | null
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
}

export type DownloadAnalyticsPayload = {
  kpis: { today: number; d7: number; d30: number }
  pins: DownloadVisitPin[]
  clusters: DownloadCluster[]
  posters: DownloadPosterRow[]
  byHour: { hour: number; scans: number }[]
  daily: { day: string; scans: number }[]
  devices: { name: string; value: number }[]
  error: string | null
}

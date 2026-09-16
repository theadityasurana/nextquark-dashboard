"use client"

import { useEffect, useRef } from "react"
import type { DownloadCluster, DownloadVisitPin, PosterMarker } from "@/lib/download-analytics-types"
import { formatIst } from "@/lib/ist"
import { placeLine } from "@/lib/geo-display"
import "leaflet/dist/leaflet.css"

export type QrMapMode = "posters" | "pins" | "clusters"

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

type TileCfg = {
  url: string
  attribution: string
  subdomains: string
  maxZoom: number
}

const OSM: TileCfg = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "&copy; OpenStreetMap contributors",
  subdomains: "abc",
  maxZoom: 19,
}

export function BangaloreQrMap({
  pins,
  clusters,
  posterMarkers,
  mode,
  picking,
  onPick,
}: {
  pins: DownloadVisitPin[]
  clusters: DownloadCluster[]
  posterMarkers: PosterMarker[]
  mode: QrMapMode
  picking?: boolean
  onPick?: (lat: number, lng: number) => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled || !elRef.current) return

      if (!mapRef.current) {
        mapRef.current = L.map(elRef.current, {
          center: [20, 0],
          zoom: 2,
          minZoom: 2,
          maxZoom: 18,
          worldCopyJump: true,
        })
        let tiles = OSM
        try {
          const res = await fetch("/api/map-basemap")
          if (res.ok) {
            const cfg = (await res.json()) as TileCfg
            if (cfg.url) tiles = cfg
          }
        } catch {
          /* OSM fallback */
        }
        L.tileLayer(tiles.url, {
          attribution: tiles.attribution,
          subdomains: tiles.subdomains,
          maxZoom: tiles.maxZoom,
        }).addTo(mapRef.current)
        layersRef.current = L.layerGroup().addTo(mapRef.current)
        mapRef.current.on("click", (e: { latlng: { lat: number; lng: number } }) => {
          onPickRef.current?.(e.latlng.lat, e.latlng.lng)
        })
      }

      const layers = layersRef.current
      if (!layers) return
      layers.clearLayers()

      if (mode === "clusters") {
        for (const c of clusters) {
          const radius = Math.min(28, 8 + Math.sqrt(c.scans) * 4)
          L.circleMarker([c.lat, c.lng], {
            radius,
            color: "#a78bfa",
            weight: 1,
            fillColor: "#8b5cf6",
            fillOpacity: 0.45,
          })
            .bindTooltip(
              `<div style="font-size:12px"><strong>${c.scans} scans</strong><br/>~150m cell · where phones were</div>`,
              { sticky: true },
            )
            .addTo(layers)
        }
      } else if (mode === "posters") {
        for (const m of posterMarkers) {
          const radius = Math.min(22, 8 + Math.sqrt(Math.max(m.scans, 1)) * 3)
          const last = m.last_seen ? `${formatIst(m.last_seen)} IST` : "no scans yet"
          const ip = m.ip_centroid
            ? `<br/><span style="opacity:.75">IP centroid (approx): ${m.ip_centroid.lat.toFixed(4)}, ${m.ip_centroid.lng.toFixed(4)}</span>`
            : ""
          L.circleMarker([m.lat, m.lng], {
            radius,
            color: "#34d399",
            weight: 2,
            fillColor: "#10b981",
            fillOpacity: 0.85,
          })
            .bindTooltip(
              `<div style="font-size:12px"><strong>${escapeHtml(m.label)}</strong><br/><code>${escapeHtml(m.campaign)}</code><br/>${m.scans} scans<br/>Last: ${escapeHtml(last)}${ip}</div>`,
              { sticky: true },
            )
            .addTo(layers)
        }
      } else {
        for (const pin of pins) {
          const loc =
            pin.place_source === "gps_geocode"
              ? "GPS+address"
              : pin.location_source === "gps" || pin.place_source === "gps_only"
                ? "GPS"
                : "IP"
          const campaignLine = pin.campaign
            ? `<br/><code>${escapeHtml(pin.campaign)}</code>`
            : ""
          const place = placeLine(pin)
          const placeLineHtml = place ? `<br/>${escapeHtml(place)}` : ""
          const approx =
            pin.place_source === "ip" || (!pin.place_source && pin.location_source !== "gps")
              ? `<br/><span style="opacity:.85">Approximate (network)</span>`
              : ""
          L.circleMarker([pin.lat, pin.lng], {
            radius: pin.location_source === "gps" ? 6 : 5,
            color: pin.location_source === "gps" ? "#34d399" : "#c4b5fd",
            weight: 1,
            fillColor: pin.location_source === "gps" ? "#10b981" : "#8b5cf6",
            fillOpacity: 0.85,
          })
            .bindTooltip(
              `<div style="font-size:12px"><strong>${escapeHtml(loc)}</strong>${placeLineHtml}${approx}${campaignLine}<br/>${escapeHtml(formatIst(pin.created_at))} IST<br/>${escapeHtml(pin.device_type || "unknown")}</div>`,
              { sticky: true },
            )
            .addTo(layers)
        }
      }

      if (mapRef.current && (mode === "pins" || mode === "clusters")) {
        const pts: [number, number][] = []
        if (mode === "clusters") {
          for (const c of clusters) pts.push([c.lat, c.lng])
        } else {
          for (const p of pins) pts.push([p.lat, p.lng])
        }
        if (pts.length === 1) {
          mapRef.current.setView(pts[0], 10)
        } else if (pts.length > 1) {
          mapRef.current.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 12 })
        }
      }

      mapRef.current.invalidateSize()
    })()

    return () => {
      cancelled = true
    }
  }, [pins, clusters, posterMarkers, mode])

  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [])

  return (
    <div
      ref={elRef}
      className={`h-[420px] w-full rounded-lg bg-muted/20 ${picking ? "cursor-crosshair ring-2 ring-primary/60" : ""}`}
    />
  )
}

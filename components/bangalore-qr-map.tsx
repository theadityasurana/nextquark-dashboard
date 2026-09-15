"use client"

import { useEffect, useRef } from "react"
import type { DownloadCluster, DownloadVisitPin } from "@/lib/download-analytics-types"
import { formatIst } from "@/lib/ist"
import "leaflet/dist/leaflet.css"

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function BangaloreQrMap({
  pins,
  clusters,
  mode,
}: {
  pins: DownloadVisitPin[]
  clusters: DownloadCluster[]
  mode: "pins" | "clusters"
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const L = (await import("leaflet")).default
      if (cancelled || !elRef.current) return

      if (!mapRef.current) {
        mapRef.current = L.map(elRef.current, {
          center: [12.97, 77.59],
          zoom: 12,
          minZoom: 11,
          maxZoom: 16,
        })
        const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim()
        const tiles = cartoKey
          ? {
              url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
              attribution: "&copy; OpenStreetMap &copy; CARTO",
              subdomains: "abcd",
              maxZoom: 19,
            }
          : {
              url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
              attribution: "&copy; OpenStreetMap contributors",
              subdomains: "abc",
              maxZoom: 19,
            }
        L.tileLayer(tiles.url, {
          attribution: tiles.attribution,
          subdomains: tiles.subdomains,
          maxZoom: tiles.maxZoom,
        }).addTo(mapRef.current)
        layersRef.current = L.layerGroup().addTo(mapRef.current)
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
              `<div style="font-size:12px"><strong>${c.scans} scans</strong><br/>~150m cell<br/>${escapeHtml(c.sample_campaign || "(untagged QR)")}</div>`,
              { sticky: true },
            )
            .addTo(layers)
        }
      } else {
        for (const pin of pins) {
          const label = escapeHtml(pin.campaign || "(untagged QR)")
          L.circleMarker([pin.lat, pin.lng], {
            radius: 5,
            color: "#c4b5fd",
            weight: 1,
            fillColor: "#8b5cf6",
            fillOpacity: 0.85,
          })
            .bindTooltip(
              `<div style="font-size:12px"><strong>${label}</strong><br/>${escapeHtml(formatIst(pin.created_at))} IST<br/>${escapeHtml(pin.device_type || "unknown")}</div>`,
              { sticky: true },
            )
            .addTo(layers)
        }
      }

      mapRef.current.invalidateSize()
    })()

    return () => {
      cancelled = true
    }
  }, [pins, clusters, mode])

  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [])

  return <div ref={elRef} className="h-[420px] w-full rounded-lg bg-muted/20" />
}

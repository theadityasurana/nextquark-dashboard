"use client"

import { useEffect, useRef, useState } from "react"
import { Maximize2, Minimize2 } from "lucide-react"
import type { DownloadCluster, DownloadVisitPin, PosterMarker } from "@/lib/download-analytics-types"
import { formatIst } from "@/lib/ist"
import { placeLine } from "@/lib/geo-display"
import { spreadPins } from "@/lib/pin-spread"
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
  const drawPinsRef = useRef<(() => void) | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
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
      if (drawPinsRef.current) {
        mapRef.current.off("zoomend", drawPinsRef.current)
        drawPinsRef.current = null
      }
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
        // Every pin is drawn as its own tiny dot. Pins that share a spot on
        // screen (same city or IP location) fan out in a small spiral so all
        // of them are visible even fully zoomed out; redrawn on each zoom.
        const map = mapRef.current!
        const drawPins = () => {
          layers.clearLayers()
          const zoom = map.getZoom()
          const screen = pins.map((p) => map.project([p.lat, p.lng], zoom))
          const spread = spreadPins(screen.map((pt) => ({ x: pt.x, y: pt.y })), 8, 5)
          pins.forEach((pin, i) => {
            const at = map.unproject([spread[i].x, spread[i].y], zoom)
            addPin(pin, at)
          })
        }
        const addPin = (pin: DownloadVisitPin, at: import("leaflet").LatLng) => {
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
          L.circleMarker(at, {
            radius: 2.5,
            color: pin.location_source === "gps" ? "#065f46" : "#4c1d95",
            weight: 0.6,
            fillColor: pin.location_source === "gps" ? "#10b981" : "#8b5cf6",
            fillOpacity: 0.95,
          })
            .bindTooltip(
              `<div style="font-size:12px"><strong>${escapeHtml(loc)}</strong>${placeLineHtml}${approx}${campaignLine}<br/>${escapeHtml(formatIst(pin.created_at))} IST<br/>${escapeHtml(pin.device_type || "unknown")}</div>`,
              { sticky: true },
            )
            .addTo(layers)
        }
        drawPinsRef.current = drawPins
        map.on("zoomend", drawPins)
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
      drawPinsRef.current?.()
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

  // Full screen: the browser's real full-screen mode where supported, and a
  // fixed overlay covering the window either way (so it also works on iOS).
  const toggleFullscreen = async () => {
    const next = !fullscreen
    setFullscreen(next)
    try {
      if (next && wrapRef.current?.requestFullscreen && !document.fullscreenElement) await wrapRef.current.requestFullscreen()
      if (!next && document.fullscreenElement) await document.exitFullscreen()
    } catch {
      /* overlay alone is fine */
    }
  }

  useEffect(() => {
    // Leaving native full screen with Esc should also leave the overlay.
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFullscreen(false) }
    document.addEventListener("fullscreenchange", onChange)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("fullscreenchange", onChange)
      window.removeEventListener("keydown", onKey)
    }
  }, [])

  useEffect(() => {
    document.body.style.overflow = fullscreen ? "hidden" : ""
    // Leaflet must re-measure after the container finishes resizing.
    // Fire at 0 ms (next tick), 150 ms (CSS transition done), and 400 ms
    // (native fullscreen animation done) so tiles always load.
    const invalidate = () => {
      mapRef.current?.invalidateSize({ animate: false })
      drawPinsRef.current?.()
    }
    invalidate()
    const t1 = setTimeout(invalidate, 150)
    const t2 = setTimeout(invalidate, 400)
    const t3 = setTimeout(invalidate, 800)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); document.body.style.overflow = "" }
  }, [fullscreen])

  return (
    <div
      ref={wrapRef}
      className={fullscreen ? "fixed inset-0 z-[2000] bg-background" : "relative"}
    >
      <div
        ref={elRef}
        className={`${fullscreen ? "h-full w-full" : "h-[300px] sm:h-[420px] w-full rounded-lg"} bg-muted/20 ${picking ? "cursor-crosshair ring-2 ring-primary/60" : ""}`}
      />
      <button
        type="button"
        onClick={toggleFullscreen}
        title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
        aria-label={fullscreen ? "Exit full screen" : "Full screen"}
        className="absolute top-3 right-3 z-[1000] inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 h-8 text-xs font-medium shadow-sm backdrop-blur hover:bg-background"
      >
        {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        {fullscreen ? "Exit" : "Full screen"}
      </button>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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

type MapProps = {
  pins: DownloadVisitPin[]
  clusters: DownloadCluster[]
  posterMarkers: PosterMarker[]
  mode: QrMapMode
  picking?: boolean
  onPick?: (lat: number, lng: number) => void
}

/** One Leaflet map. Full screen mounts a second, fresh instance at full size
 *  rather than stretching this one (resizing in place kept leaving the tile
 *  layer blank, with only the vector dots drawn). */
function MapCanvas({
  pins,
  clusters,
  posterMarkers,
  mode,
  picking,
  onPick,
  className,
}: MapProps & { className: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import("leaflet").Map | null>(null)
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null)
  const tilesRef = useRef<import("leaflet").TileLayer | null>(null)
  const drawPinsRef = useRef<(() => void) | null>(null)
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
        tilesRef.current = L.tileLayer(tiles.url, {
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
        // screen (same city or IP location) are packed into a small disc on
        // that spot. The disc is capped (it grows a little as you zoom in), so
        // thousands of Bangalore scans read as one dense blob over Bangalore
        // rather than a ring spreading across the region. Redrawn on zoom.
        const map = mapRef.current!
        const drawPins = () => {
          layers.clearLayers()
          const zoom = map.getZoom()
          const screen = pins.map((p) => map.project([p.lat, p.lng], zoom))
          const maxRadius = 6 + zoom * 1.25 // ≈ 8.5px world view → ≈ 21px street level
          const spread = spreadPins(screen.map((pt) => ({ x: pt.x, y: pt.y })), 8, 4, maxRadius)
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
            radius: 2,
            color: pin.location_source === "gps" ? "#065f46" : "#4c1d95",
            weight: 0.4,
            fillColor: pin.location_source === "gps" ? "#10b981" : "#8b5cf6",
            // Slightly translucent so overlapping dots build up colour: denser
            // spots look darker instead of every blob looking the same.
            fillOpacity: 0.7,
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
      tilesRef.current = null
    }
  }, [])

  // Whenever the map box changes size (entering/leaving full screen, window
  // resize, sidebar collapse) Leaflet has to re-measure and fetch tiles for the
  // new area, otherwise only the vector dots show on a blank background.
  useEffect(() => {
    const el = elRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    let frame = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const map = mapRef.current
        if (!map || el.clientWidth === 0 || el.clientHeight === 0) return
        // invalidateSize alone loads tiles for the new area. Don't redraw():
        // it throws away every loaded tile on each resize event.
        map.invalidateSize({ animate: false })
        drawPinsRef.current?.()
      })
    })
    ro.observe(el)
    return () => { cancelAnimationFrame(frame); ro.disconnect() }
  }, [])

  return (
    <div
      ref={elRef}
      className={`${className} bg-muted/20 ${picking ? "cursor-crosshair ring-2 ring-primary/60" : ""}`}
    />
  )
}

export function BangaloreQrMap(props: MapProps) {
  const [fullscreen, setFullscreen] = useState(false)

  const close = useCallback(() => {
    setFullscreen(false)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }, [])

  const open = () => {
    setFullscreen(true)
    // Whole-page native full screen (hides browser chrome). The map itself is
    // a body-level overlay, so it never depends on how the page lays out.
    document.documentElement.requestFullscreen?.().catch(() => { /* overlay alone is fine */ })
  }

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
    // Leaving native full screen (Esc, browser UI) also closes the overlay.
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false) }
    window.addEventListener("keydown", onKey)
    document.addEventListener("fullscreenchange", onChange)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.removeEventListener("fullscreenchange", onChange)
      document.body.style.overflow = prevOverflow
    }
  }, [fullscreen, close])

  const btn = "absolute top-3 right-3 z-[1000] inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-2.5 h-8 text-xs font-medium shadow-sm backdrop-blur hover:bg-background"

  return (
    <div className="relative">
      <MapCanvas {...props} className="h-[300px] sm:h-[420px] w-full rounded-lg" />
      <button type="button" onClick={open} title="Full screen" aria-label="Full screen" className={btn}>
        <Maximize2 className="h-3.5 w-3.5" /> Full screen
      </button>

      {fullscreen && createPortal(
        <div className="fixed inset-0 z-[2000] bg-background">
          <MapCanvas {...props} className="absolute inset-0 h-full w-full" />
          <button type="button" onClick={close} title="Exit full screen (Esc)" aria-label="Exit full screen" className={btn}>
            <Minimize2 className="h-3.5 w-3.5" /> Exit
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}

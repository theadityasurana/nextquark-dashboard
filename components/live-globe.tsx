"use client"

import { useEffect, useRef, useState } from "react"
import createGlobe from "cobe"
import { Maximize2, Minimize2, Minus, Plus, RotateCcw } from "lucide-react"

export type GlobePoint = { lat: number; lng: number; size: number }

const MIN_ZOOM = 0.8, MAX_ZOOM = 3

/**
 * Rotating, draggable 3D globe. Big dots = active users, small dots = landing-page visitors.
 * Zoom with the buttons or the mouse wheel; full-screen button top right.
 */
export function LiveGlobe({ points, size = 520 }: { points: GlobePoint[]; size?: number }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const markers = useRef(points)
  markers.current = points
  const drag = useRef<{ x: number; y: number; phi: number; theta: number } | null>(null)
  const phiRef = useRef(4.2) // starts over India
  const thetaRef = useRef(0.25)
  const zoomRef = useRef(1)
  const [zoom, setZoom] = useState(1)
  const [full, setFull] = useState(false)
  const [px, setPx] = useState(size)

  // Canvas size: the prop normally, most of the screen in full-screen mode.
  useEffect(() => {
    const fit = () => setPx(full ? Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.9) : size)
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [full, size])

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrap.current)
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  const setZoomTo = (z: number) => {
    const v = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z * 100) / 100))
    zoomRef.current = v
    setZoom(v)
  }

  // Wheel zoom on the globe only (doesn't scroll the page while over it).
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const onWheel = (e: WheelEvent) => { e.preventDefault(); setZoomTo(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1)) }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(() => {
    if (!canvas.current) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const globe = createGlobe(canvas.current, {
      devicePixelRatio: dpr,
      width: px * dpr,
      height: px * dpr,
      phi: phiRef.current,
      theta: thetaRef.current,
      dark: 0,
      diffuse: 1.1,
      scale: zoomRef.current,
      mapSamples: 20000,
      mapBrightness: 3.2,
      mapBaseBrightness: 0.05,
      baseColor: [0.86, 0.89, 0.96],
      markerColor: [0.3, 0.08, 0.72],
      glowColor: [0.82, 0.85, 1],
      markers: [],
      onRender: (state) => {
        if (!drag.current) phiRef.current += 0.0022
        state.phi = phiRef.current
        state.theta = thetaRef.current
        state.scale = zoomRef.current
        state.markers = markers.current.map(p => ({ location: [p.lat, p.lng] as [number, number], size: p.size }))
        state.width = px * dpr
        state.height = px * dpr
      },
    })
    return () => globe.destroy()
  }, [px])

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void wrap.current?.requestFullscreen?.()
  }
  const btn = "flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted disabled:opacity-40"

  return (
    <div ref={wrap} className={`relative flex items-center justify-center ${full ? "h-screen w-screen bg-[#eef3fa]" : "w-full"}`}>
      <canvas
        ref={canvas}
        style={{ width: px, height: px, maxWidth: "100%", aspectRatio: "1", cursor: "grab", touchAction: "none" }}
        onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY, phi: phiRef.current, theta: thetaRef.current }; (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId); (e.target as HTMLCanvasElement).style.cursor = "grabbing" }}
        onPointerUp={e => { drag.current = null; (e.target as HTMLCanvasElement).style.cursor = "grab" }}
        onPointerCancel={() => { drag.current = null }}
        onPointerMove={e => {
          if (!drag.current) return
          const k = 180 * zoomRef.current
          phiRef.current = drag.current.phi + (e.clientX - drag.current.x) / k
          thetaRef.current = Math.max(-1.2, Math.min(1.2, drag.current.theta + (e.clientY - drag.current.y) / k))
        }}
      />
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button type="button" className={btn} onClick={toggleFull} title={full ? "Exit full screen" : "Full screen"}>{full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        <button type="button" className={btn} onClick={() => setZoomTo(zoom * 1.25)} disabled={zoom >= MAX_ZOOM} title="Zoom in"><Plus className="h-4 w-4" /></button>
        <button type="button" className={btn} onClick={() => setZoomTo(zoom / 1.25)} disabled={zoom <= MIN_ZOOM} title="Zoom out"><Minus className="h-4 w-4" /></button>
        <button type="button" className={btn} onClick={() => { setZoomTo(1); thetaRef.current = 0.25 }} title="Reset view"><RotateCcw className="h-3.5 w-3.5" /></button>
      </div>
      {full && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">Drag to spin · scroll or +/− to zoom · Esc to exit</div>}
    </div>
  )
}

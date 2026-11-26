"use client"

import { useEffect, useRef } from "react"
import createGlobe from "cobe"

export type GlobePoint = { lat: number; lng: number; size: number }

/** A rotating, draggable 3D globe. Big dots = active users, small dots = landing-page visitors. */
export function LiveGlobe({ points, size = 520 }: { points: GlobePoint[]; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const markers = useRef(points)
  markers.current = points
  const drag = useRef<{ x: number; phi: number } | null>(null)
  const phiRef = useRef(4.2) // starts over India

  useEffect(() => {
    if (!canvas.current) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const globe = createGlobe(canvas.current, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi: phiRef.current,
      theta: 0.25,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.93, 0.95, 0.99],
      markerColor: [0.43, 0.29, 0.88],
      glowColor: [0.85, 0.88, 1],
      markers: [],
      onRender: (state) => {
        if (!drag.current) phiRef.current += 0.0025
        state.phi = phiRef.current
        state.markers = markers.current.map(p => ({ location: [p.lat, p.lng] as [number, number], size: p.size }))
        state.width = size * dpr
        state.height = size * dpr
      },
    })
    return () => globe.destroy()
  }, [size])

  return (
    <canvas
      ref={canvas}
      style={{ width: size, height: size, maxWidth: "100%", aspectRatio: "1", cursor: "grab", touchAction: "pan-y" }}
      onPointerDown={e => { drag.current = { x: e.clientX, phi: phiRef.current }; (e.target as HTMLCanvasElement).style.cursor = "grabbing" }}
      onPointerUp={e => { drag.current = null; (e.target as HTMLCanvasElement).style.cursor = "grab" }}
      onPointerOut={() => { drag.current = null }}
      onPointerMove={e => { if (drag.current) phiRef.current = drag.current.phi + (e.clientX - drag.current.x) / 180 }}
    />
  )
}

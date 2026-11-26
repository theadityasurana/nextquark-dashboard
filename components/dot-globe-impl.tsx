"use client"

import { useEffect, useRef, useState } from "react"
import Globe from "react-globe.gl"
import { Maximize2, Minimize2, Minus, Plus, RotateCcw } from "lucide-react"

export type DotPoint = { lat: number; lng: number; color: string; r: number }

const HOME = { lat: 20, lng: 78, altitude: 2.2 } // India in view

/** Dark 3D globe drawing every visit / user as its own small dot (thousands are fine). */
export default function DotGlobeImpl({ points, height = 480 }: { points: DotPoint[]; height?: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globe = useRef<any>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [full, setFull] = useState(false)
  const [vh, setVh] = useState(800)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => { setWidth(el.clientWidth); setVh(window.innerHeight) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === wrap.current)
    document.addEventListener("fullscreenchange", onFs)
    return () => document.removeEventListener("fullscreenchange", onFs)
  }, [])

  const ready = () => {
    const g = globe.current
    if (!g) return
    const c = g.controls()
    c.autoRotate = true
    c.autoRotateSpeed = 0.45
    c.enableDamping = true
    c.minDistance = 130
    c.maxDistance = 700
    g.pointOfView(HOME, 0)
  }

  const zoom = (factor: number) => {
    const g = globe.current
    if (!g) return
    const pov = g.pointOfView()
    g.pointOfView({ ...pov, altitude: Math.max(0.35, Math.min(4.5, pov.altitude * factor)) }, 450)
  }
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void wrap.current?.requestFullscreen?.()
  }
  const btn = "flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"

  return (
    <div ref={wrap} className={`relative w-full overflow-hidden ${full ? "" : "rounded-xl"} bg-[#070b16]`} style={{ height: full ? vh : height }}>
      <Globe
        ref={globe}
        width={width}
        height={full ? vh : height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="https://unpkg.com/three-globe@2.41.12/example/img/earth-dark.jpg"
        showAtmosphere
        atmosphereColor="#6f8cff"
        atmosphereAltitude={0.16}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointColor="color"
        pointRadius="r"
        pointAltitude={0.006}
        pointResolution={6}
        pointsMerge
        pointsTransitionDuration={0}
        onGlobeReady={ready}
      />
      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button type="button" className={btn} onClick={toggleFull} title={full ? "Exit full screen" : "Full screen"}>{full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
        <button type="button" className={btn} onClick={() => zoom(0.72)} title="Zoom in"><Plus className="h-4 w-4" /></button>
        <button type="button" className={btn} onClick={() => zoom(1.38)} title="Zoom out"><Minus className="h-4 w-4" /></button>
        <button type="button" className={btn} onClick={() => globe.current?.pointOfView(HOME, 700)} title="Reset view"><RotateCcw className="h-3.5 w-3.5" /></button>
      </div>
      {full && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70">Drag to spin · scroll or +/− to zoom · Esc to exit</div>}
    </div>
  )
}

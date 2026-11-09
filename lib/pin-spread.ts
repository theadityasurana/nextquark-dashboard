/**
 * Spreads map pins that land on (nearly) the same screen pixel so every pin
 * stays visible as its own dot at any zoom level.
 *
 * Works in screen pixels: points that fall in the same `cell`-sized square are
 * laid out in a tight sunflower spiral around their shared centre, `spacing`
 * pixels apart. As the map zooms in, real positions separate and the spiral
 * collapses back onto the true locations.
 */

export interface Px {
  x: number
  y: number
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)) // ≈ 137.5°

export function spreadPins(points: Px[], cell = 8, spacing = 5): Px[] {
  const buckets = new Map<string, number[]>()
  points.forEach((p, i) => {
    const key = `${Math.round(p.x / cell)}:${Math.round(p.y / cell)}`
    const list = buckets.get(key)
    if (list) list.push(i)
    else buckets.set(key, [i])
  })

  const out: Px[] = points.map((p) => ({ x: p.x, y: p.y }))
  for (const idx of buckets.values()) {
    if (idx.length < 2) continue
    const cx = idx.reduce((s, i) => s + points[i].x, 0) / idx.length
    const cy = idx.reduce((s, i) => s + points[i].y, 0) / idx.length
    idx.forEach((pointIndex, k) => {
      const r = spacing * Math.sqrt(k)
      const a = k * GOLDEN_ANGLE
      out[pointIndex] = { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
    })
  }
  return out
}

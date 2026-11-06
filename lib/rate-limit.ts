import { NextRequest, NextResponse } from 'next/server'

/**
 * Per-IP, fixed-window rate limiter, held in memory.
 *
 * This used to write a Postgres row in middleware, adding a database round trip
 * in front of EVERY API call. Limits are now per server instance rather than
 * global, which is enough to stop a runaway client and costs no network.
 */

interface RateLimit {
  requests: number
  windowSeconds: number
}

const LIMITS: Record<string, RateLimit> = {
  '/api/overview':        { requests: 30,  windowSeconds: 60 },
  '/api/auto-apply':      { requests: 10,  windowSeconds: 60 },
  '/api/auto-apply-queue':{ requests: 30,  windowSeconds: 60 },
  '/api/live-queue':      { requests: 120, windowSeconds: 60 },
  '/api/ats-sync':        { requests: 20,  windowSeconds: 60 },
  '/api/ats-sync-all':    { requests: 5,   windowSeconds: 60 },
  '/api/cleanup-jobs':    { requests: 5,   windowSeconds: 60 },
}
const DEFAULT_LIMIT: RateLimit = { requests: 120, windowSeconds: 60 }
const MAX_TRACKED_KEYS = 10_000

const counters = new Map<string, number>()

function getLimit(pathname: string): RateLimit {
  // Longest prefix wins: /api/auto-apply must not shadow /api/auto-apply-queue.
  const match = Object.keys(LIMITS)
    .filter((path) => pathname.startsWith(path))
    .sort((a, b) => b.length - a.length)[0]
  return match ? LIMITS[match] : DEFAULT_LIMIT
}

function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function rateLimit(request: NextRequest): Promise<NextResponse | null> {
  // Cron routes authenticate with CRON_SECRET instead.
  if (request.nextUrl.pathname.startsWith('/api/cron')) return null

  const path = request.nextUrl.pathname
  const limit = getLimit(path)
  const windowKey = Math.floor(Date.now() / (limit.windowSeconds * 1000))
  const key = `${getIp(request)}:${path}:${windowKey}`

  if (counters.size > MAX_TRACKED_KEYS) counters.clear()
  const count = (counters.get(key) ?? 0) + 1
  counters.set(key, count)
  if (count <= limit.requests) return null

  return NextResponse.json(
    { error: 'Too many requests. Please slow down.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(limit.windowSeconds),
        'X-RateLimit-Limit': String(limit.requests),
        'X-RateLimit-Remaining': '0',
      },
    }
  )
}

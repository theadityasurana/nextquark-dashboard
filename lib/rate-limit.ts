import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Simple rate limiter backed by Supabase.
 *
 * Uses a sliding window counter per IP. No Redis required.
 * For higher traffic, swap the Supabase calls for an Upstash Redis client.
 *
 * Limits (per IP, per window):
 *   - /api/overview:          30 requests / 60s  (dashboard refresh)
 *   - /api/auto-apply*:       10 requests / 60s  (automation trigger)
 *   - /api/live-queue:        60 requests / 60s  (queue operations)
 *   - everything else:       120 requests / 60s  (general API)
 */

interface RateLimit {
  requests: number
  windowSeconds: number
}

const LIMITS: Record<string, RateLimit> = {
  '/api/overview':        { requests: 30,  windowSeconds: 60 },
  '/api/auto-apply':      { requests: 10,  windowSeconds: 60 },
  '/api/auto-apply-queue':{ requests: 10,  windowSeconds: 60 },
  '/api/live-queue':      { requests: 60,  windowSeconds: 60 },
  '/api/ats-sync':        { requests: 20,  windowSeconds: 60 },
  '/api/ats-sync-all':    { requests: 5,   windowSeconds: 60 },
  '/api/cleanup-jobs':    { requests: 5,   windowSeconds: 60 },
}
const DEFAULT_LIMIT: RateLimit = { requests: 120, windowSeconds: 60 }

function getLimit(pathname: string): RateLimit {
  for (const [path, limit] of Object.entries(LIMITS)) {
    if (pathname.startsWith(path)) return limit
  }
  return DEFAULT_LIMIT
}

function getIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function rateLimit(request: NextRequest): Promise<NextResponse | null> {
  // Skip rate limiting for cron routes (they use CRON_SECRET auth instead)
  if (request.nextUrl.pathname.startsWith('/api/cron')) return null

  const ip = getIp(request)
  const path = request.nextUrl.pathname
  const limit = getLimit(path)
  const windowKey = Math.floor(Date.now() / (limit.windowSeconds * 1000))
  const key = `${ip}:${path}:${windowKey}`

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('increment_rate_limit', {
      key_arg: key,
      ttl_seconds: limit.windowSeconds,
    })

    if (error) {
      // Fail open — a broken rate limiter must not take down the API
      console.warn('[rate-limit] rpc error, failing open:', error.message)
      return null
    }

    const count = data as number
    if (count > limit.requests) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(limit.windowSeconds),
            'X-RateLimit-Limit': String(limit.requests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String((windowKey + 1) * limit.windowSeconds),
          },
        }
      )
    }

    return null // allowed
  } catch {
    return null // fail open
  }
}

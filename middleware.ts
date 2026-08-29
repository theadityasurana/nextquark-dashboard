import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'

export async function middleware(request: NextRequest) {
  // Only rate-limit API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const limited = await rateLimit(request)
    if (limited) return limited
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}

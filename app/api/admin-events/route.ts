import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAdminEvents } from '@/lib/admin-events'

export const dynamic = 'force-dynamic'

/**
 * Feed for the open-tab notifier fallback: signups and paid upgrades since a
 * cursor. The client stores the returned `now` as its next cursor, so the
 * server clock is the only clock that matters.
 */
export async function GET(req: NextRequest) {
  const now = new Date().toISOString()
  const since = req.nextUrl.searchParams.get('since')
  // No cursor yet (first run): just hand back one so we don't replay history.
  if (!since || !Number.isFinite(Date.parse(since))) return Response.json({ now, signups: [], upgrades: [] })
  try {
    const { signups, upgrades, error } = await fetchAdminEvents(createAdminClient(), since)
    return Response.json({ now, signups, upgrades, error })
  } catch (e) {
    // Keep the old cursor on failure so nothing is skipped.
    return Response.json({ now: since, signups: [], upgrades: [], error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}

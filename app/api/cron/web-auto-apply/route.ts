import { NextRequest } from 'next/server'
import { runWebAutoApply } from '@/lib/web-auto-apply'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Iris auto-apply for website subscribers (see lib/web-auto-apply.ts).
 * Vercel cron calls GET with the CRON_SECRET; ?userId= runs one person, ?dryRun=1 only lists jobs.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sp = request.nextUrl.searchParams
  try {
    const results = await runWebAutoApply({ userId: sp.get('userId') || undefined, dryRun: sp.get('dryRun') === '1' })
    const applied = results.reduce((n, r) => n + r.applied, 0)
    console.log('[web-auto-apply]', JSON.stringify({ applied, users: results.length }))
    return Response.json({ applied, results })
  } catch (err) {
    console.error('[web-auto-apply]', err)
    return Response.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 500 })
  }
}

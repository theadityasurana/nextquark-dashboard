import { isSectionKey } from '@/lib/remote-config/core'
import { db, errorResponse } from '@/lib/remote-config/server'

export const dynamic = 'force-dynamic'

// Version history for one section (doc §4.7). Needs the service key.
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  if (!isSectionKey(key)) return Response.json({ error: `Unknown section: ${key}` }, { status: 404 })
  const limit = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get('limit')) || 50))
  try {
    const { data, error } = await db()
      .from('remote_config_history')
      .select('id, key, version, old_value, new_value, changed_by, note, changed_at')
      .eq('key', key)
      .order('version', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (error) throw error
    return Response.json(data ?? [])
  } catch (err) {
    return errorResponse(err)
  }
}

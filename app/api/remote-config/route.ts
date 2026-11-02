import { db, errorResponse, ROW_COLUMNS } from '@/lib/remote-config/server'

export const dynamic = 'force-dynamic'

// All sections (doc §4.1).
export async function GET() {
  try {
    const { data, error } = await db().from('remote_config').select(ROW_COLUMNS).order('key')
    if (error) throw error
    return Response.json(data ?? [])
  } catch (err) {
    return errorResponse(err)
  }
}

// Server-only access to remote config. Uses the service role key via
// createAdminClient(); never import this from a client component (the key is
// read from SUPABASE_SERVICE_ROLE_KEY, which is undefined in the browser).
import { createAdminClient } from '@/lib/supabase/admin'
import { describeDbError, type ConfigRow } from './core'

export const ROW_COLUMNS = 'key, value, default_value, description, version, updated_at, updated_by'

export function db() {
  return createAdminClient()
}

export async function readRow(key: string): Promise<ConfigRow | null> {
  const { data, error } = await db().from('remote_config').select(ROW_COLUMNS).eq('key', key).maybeSingle()
  if (error) throw error
  return (data as ConfigRow | null) ?? null
}

export function errorResponse(err: unknown): Response {
  if (err && typeof err === 'object' && ('code' in err || 'message' in err)) {
    const { status, message } = describeDbError(err as { code?: string; message?: string })
    console.error('[remote-config]', (err as { code?: string }).code, message)
    return Response.json({ error: message, code: (err as { code?: string }).code ?? null }, { status })
  }
  console.error('[remote-config]', err)
  return Response.json({ error: 'Unexpected server error.' }, { status: 500 })
}

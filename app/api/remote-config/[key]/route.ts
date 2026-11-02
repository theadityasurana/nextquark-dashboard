import { checkSection, isSectionKey, setAt, type Json, type JsonObject } from '@/lib/remote-config/core'
import { db, errorResponse, readRow } from '@/lib/remote-config/server'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ key: string }> }

// One section (doc §4.2).
export async function GET(_req: Request, { params }: Params) {
  const { key } = await params
  if (!isSectionKey(key)) return Response.json({ error: `Unknown section: ${key}` }, { status: 404 })
  try {
    const row = await readRow(key)
    if (!row) return Response.json({ error: `Section ${key} isn't in the database.` }, { status: 404 })
    return Response.json(row)
  } catch (err) {
    return errorResponse(err)
  }
}

type Body =
  | { action: 'validate'; value: JsonObject }
  | { action: 'set'; value: JsonObject; note?: string; expectedVersion?: number }
  | { action: 'field'; path: string[]; value: Json; note?: string; expectedVersion?: number }
  | { action: 'reset'; note?: string; expectedVersion?: number }
  | { action: 'rollback'; version: number; note?: string; expectedVersion?: number }

const isObject = (v: unknown): v is JsonObject => !!v && typeof v === 'object' && !Array.isArray(v)
const cleanNote = (n: unknown) => (typeof n === 'string' && n.trim() ? n.trim().slice(0, 500) : null)

/**
 * Writes go through the admin_* RPCs with the service key (doc §4.3–4.7).
 * `expectedVersion` makes the server refuse with 409 if someone else saved
 * since the editor loaded the row; the client then shows the conflict.
 */
export async function POST(req: Request, { params }: Params) {
  const { key } = await params
  if (!isSectionKey(key)) return Response.json({ error: `Unknown section: ${key}` }, { status: 404 })

  let body: Body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 })
  }

  try {
    const supabase = db()

    if (body.action === 'validate') {
      if (!isObject(body.value)) return Response.json({ problems: ['value must be an object'] })
      const { data, error } = await supabase.rpc('admin_validate_config', { p_key: key, p_value: body.value })
      if (error) throw error
      return Response.json({ problems: (data as string[] | null) ?? [] })
    }

    const current = await readRow(key)
    if (!current) return Response.json({ error: `Section ${key} isn't in the database.` }, { status: 404 })

    if (typeof body.expectedVersion === 'number' && body.expectedVersion !== current.version) {
      return Response.json(
        { error: `Someone else saved ${key} (now version ${current.version}) since you loaded version ${body.expectedVersion}.`, conflict: true, row: current },
        { status: 409 },
      )
    }

    // Website-side meaning checks (§8.4) are enforced here too, not just in the UI.
    const blockIfInvalid = (value: JsonObject) => {
      const errors = checkSection(key, value, current.default_value, current.value).filter(i => i.severity === 'error')
      return errors.length
        ? Response.json({ error: errors.map(e => `${e.path.join('.') || key}: ${e.message}`).join(' '), issues: errors }, { status: 400 })
        : null
    }

    let rpc: { name: string; args: Record<string, unknown> }
    switch (body.action) {
      case 'set': {
        if (!isObject(body.value)) return Response.json({ error: 'value must be a JSON object.' }, { status: 400 })
        const blocked = blockIfInvalid(body.value)
        if (blocked) return blocked
        rpc = { name: 'admin_set_config', args: { p_key: key, p_value: body.value, p_note: cleanNote(body.note) } }
        break
      }
      case 'field': {
        if (!Array.isArray(body.path) || body.path.length === 0 || !body.path.every(p => typeof p === 'string')) {
          return Response.json({ error: 'path must be a non-empty list of field names.' }, { status: 400 })
        }
        const blocked = blockIfInvalid(setAt(current.value, body.path, body.value))
        if (blocked) return blocked
        rpc = { name: 'admin_set_config_field', args: { p_key: key, p_path: body.path, p_value: body.value, p_note: cleanNote(body.note) } }
        break
      }
      case 'reset':
        rpc = { name: 'admin_reset_config', args: { p_key: key, p_note: cleanNote(body.note) ?? 'reset to default' } }
        break
      case 'rollback':
        if (!Number.isInteger(body.version)) return Response.json({ error: 'version must be a whole number.' }, { status: 400 })
        rpc = { name: 'admin_rollback_config', args: { p_key: key, p_version: body.version, p_note: cleanNote(body.note) } }
        break
      default:
        return Response.json({ error: 'Unknown action.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc(rpc.name, rpc.args)
    if (error) throw error
    return Response.json({ row: data, changed: (data as { version: number }).version !== current.version })
  } catch (err) {
    return errorResponse(err)
  }
}

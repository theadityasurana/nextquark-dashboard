import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest } from 'next/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('settings')
      .select('system_down, system_down_message')
      .single()

    return Response.json(
      {
        is_down: data?.system_down ?? false,
        message: data?.system_down_message ?? "We'll be back soon. Our systems are undergoing maintenance.",
      },
      { headers: CORS }
    )
  } catch {
    return Response.json({ is_down: false, message: '' }, { headers: CORS })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { is_down, message } = await req.json()
    const supabase = createAdminClient()

    const update: Record<string, unknown> = { id: 1 }
    if (is_down !== undefined) update.system_down = is_down
    if (message !== undefined) update.system_down_message = message

    const { error } = await supabase.from('settings').upsert(update, { onConflict: 'id' })
    if (error) throw error

    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

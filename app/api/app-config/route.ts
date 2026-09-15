import { createAdminClient } from '@/lib/supabase/admin'

const supabase = createAdminClient()

export async function GET() {
  const { data, error } = await supabase
    .from('app_config')
    .select('key, value, updated_at')
    .eq('key', 'show_location_on_card')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function PATCH(request: Request) {
  const { key, value } = await request.json()
  const { error } = await supabase
    .from('app_config')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Singleton admin client — one connection pool shared across all API routes.
// Creating a new client per-request bypasses connection pooling entirely.
let _adminClient: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient
  _adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
  return _adminClient
}

import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabase = getAdminClient()

  const [{ count: total }, { count: premium }] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true })
      .in("subscription_type", ["premium", "pro"]),
  ])

  return NextResponse.json({
    total: total ?? 0,
    premium: premium ?? 0,
    free: (total ?? 0) - (premium ?? 0),
  })
}

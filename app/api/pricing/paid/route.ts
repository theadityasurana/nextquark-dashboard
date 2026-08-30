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

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, subscription_type, subscription_start_date, subscription_end_date")
    .in("subscription_type", ["premium", "pro"])
    .order("subscription_start_date", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data || [])
}

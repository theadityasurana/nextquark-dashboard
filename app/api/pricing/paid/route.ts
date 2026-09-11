import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = createAdminClient()

  const rows: any[] = []
  const PAGE = 1000

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, subscription_type, subscription_start_date, subscription_end_date, region, billing_period, platform")
      .not("subscription_type", "is", null)
      .not("subscription_type", "eq", "free")
      .order("subscription_start_date", { ascending: false })
      .range(from, from + PAGE - 1)

    if (error) {
      // Fallback without optional columns
      const { data: basic, error: e2 } = await supabase
        .from("profiles")
        .select("id, email, full_name, subscription_type, subscription_start_date, subscription_end_date")
        .not("subscription_type", "is", null)
        .not("subscription_type", "eq", "free")
        .order("subscription_start_date", { ascending: false })
        .range(from, from + PAGE - 1)

      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
      const padded = (basic ?? []).map((u) => ({ ...u, region: null, billing_period: null, platform: null }))
      rows.push(...padded)
      if ((basic?.length ?? 0) < PAGE) break
      continue
    }

    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }

  return NextResponse.json(rows)
}

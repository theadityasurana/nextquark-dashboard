import { cachedRoute } from "@/lib/server-cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { planOf, periodOf, regionOf, subscriptionState, monthlyRevenue } from "@/lib/plans"

// Paid and lapsed subscribers, with the app's rules applied (lib/plans.ts).
// profiles has no `region` / `platform` columns: the old select always failed
// and fell back to rows with neither, so store fees were never counted.
// Region comes from pricing_region; store from which purchase id is stored.

async function load(): Promise<Response> {
  const supabase = createAdminClient()
  const rows: any[] = []
  const PAGE = 1000

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, subscription_type, subscription_plan, subscription_status, subscription_start_date, subscription_end_date, billing_period, pricing_region, google_play_purchase_token, razorpay_subscription_id")
      // Paying now, or a paid plan that lapsed (the expiry job keeps the plan name).
      .or("subscription_type.eq.premium,subscription_status.eq.expired,subscription_status.eq.payment_failed")
      .order("subscription_start_date", { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }

  return NextResponse.json(rows.map(r => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    subscription_type: r.subscription_type,
    plan: planOf(r),
    state: subscriptionState(r),
    subscription_status: r.subscription_status,
    subscription_start_date: r.subscription_start_date,
    subscription_end_date: r.subscription_end_date,
    billing_period: periodOf(r),
    region: regionOf(r),
    platform: r.google_play_purchase_token ? "android" : r.razorpay_subscription_id ? "razorpay" : null,
    monthly_revenue: monthlyRevenue(r),
  })))
}

// Shared across requests: this reads whole tables, and several tabs/devices ask at once.
export function GET(request: Request) {
  return cachedRoute(request, 120_000, load)
}

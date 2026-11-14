import { cachedRoute } from "@/lib/server-cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { PLAN_IDS, hasPaidAccess, planOf, periodOf, regionOf, monthlyRevenue, subscriptionState, type SubscriptionRow } from "@/lib/plans"

// Plan counts and MRR, computed with the app's own rules (lib/plans.ts):
// the plan is subscription_plan, a lapsed plan is not paying, quarterly
// revenue counts as a third per month, region is pricing_region.

async function getAllAuthUsers(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  // Supabase auth.admin.listUsers max perPage is 1000, no total field in response.
  let total = 0
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users) break
    total += data.users.length
    if (data.users.length < 1000) break
    page++
  }
  return total
}

async function getAllProfiles(supabase: ReturnType<typeof createAdminClient>) {
  const rows: SubscriptionRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("profiles")
      .select("subscription_type, subscription_plan, subscription_status, subscription_end_date, billing_period, pricing_region")
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

async function load(): Promise<Response> {
  const supabase = createAdminClient()
  const [totalUsers, profileRows] = await Promise.all([getAllAuthUsers(supabase), getAllProfiles(supabase)])

  const zero = () => Object.fromEntries(PLAN_IDS.map(p => [p, 0])) as Record<string, number>
  const planCounts: Record<string, number> = { free: 0, ...zero() }
  const inCounts = zero()
  const intlCounts = zero()
  let monthlyCount = 0, quarterlyCount = 0, lapsed = 0, cancelledInTerm = 0
  let mrrUSD = 0, mrrINR = 0

  for (const row of profileRows) {
    const state = subscriptionState(row)
    if (state === "lapsed") lapsed++
    if (!hasPaidAccess(row)) { planCounts.free++; continue }
    if (state === "cancelled") cancelledInTerm++
    const plan = planOf(row) ?? "pro"
    planCounts[plan] = (planCounts[plan] ?? 0) + 1
    const region = regionOf(row)
    if (region === "IN") { inCounts[plan]++; mrrINR += monthlyRevenue(row) }
    else { intlCounts[plan]++; mrrUSD += monthlyRevenue(row) }
    if (periodOf(row) === "quarterly") quarterlyCount++
    else monthlyCount++
  }

  const free = planCounts.free
  const paid = profileRows.length - free

  return NextResponse.json({
    total: totalUsers || profileRows.length,
    paid,
    free,
    planCounts,
    inCounts,
    intlCounts,
    monthlyCount,
    quarterlyCount,
    lapsed,
    cancelledInTerm,
    mrrUSD: Math.round(mrrUSD * 100) / 100,
    mrrINR: Math.round(mrrINR),
  })
}

// Shared across requests: this reads whole tables, and several tabs/devices ask at once.
export function GET(request: Request) {
  return cachedRoute(request, 120_000, load)
}

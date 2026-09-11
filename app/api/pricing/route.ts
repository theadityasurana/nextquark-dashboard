import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

const INTL_PRICES: Record<string, number> = { pro: 19.99, power: 39.99, max: 59.99 }
const IN_PRICES: Record<string, number>   = { starter: 499, pro: 999, power: 2199 }

const LEGACY_MAP: Record<string, string> = {
  premium: "pro", nq_premium_monthly: "pro", nq_premium_weekly: "pro",
  nq_pro_monthly: "pro", nq_pro_yearly: "pro",
  nq_power_monthly: "power", nq_power_yearly: "power",
  nq_max_monthly: "max", nq_max_yearly: "max",
  nq_starter_monthly: "starter", nq_starter_yearly: "starter",
}

function canonicalize(sub: string | null): string {
  if (!sub) return "free"
  return LEGACY_MAP[sub.toLowerCase()] ?? sub.toLowerCase()
}

async function getAllAuthUsers(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  // Supabase auth.admin.listUsers max perPage is 1000, no total field in response.
  // Must page through until we get a partial page.
  let total = 0
  let page  = 1
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
  // PostgREST default limit is 1000. Use range-based pagination to get all rows.
  const rows: Array<{ subscription_type: string | null; region: string | null; billing_period: string | null }> = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("profiles")
      .select("subscription_type, region, billing_period")
      .range(from, from + PAGE - 1)
    if (error || !data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

export async function GET() {
  const supabase = createAdminClient()

  // Run auth count and profile fetch in parallel
  const [totalUsers, profileRows] = await Promise.all([
    getAllAuthUsers(supabase),
    getAllProfiles(supabase),
  ])

  const planCounts: Record<string, number> = {}
  const inCounts:   Record<string, number> = {}
  const intlCounts: Record<string, number> = {}
  let monthlyCount = 0, annualCount = 0

  for (const row of profileRows) {
    const plan = canonicalize(row.subscription_type)
    planCounts[plan] = (planCounts[plan] ?? 0) + 1

    const isIN = row.region === "IN"
    if (isIN) inCounts[plan]   = (inCounts[plan]   ?? 0) + 1
    else      intlCounts[plan] = (intlCounts[plan]  ?? 0) + 1

    if (row.billing_period === "annual") annualCount++
    else if (plan !== "free") monthlyCount++
  }

  const free = planCounts.free ?? 0
  const paid = profileRows.length - free

  const mrrUSD = Object.entries(INTL_PRICES).reduce((s, [p, price]) => s + (intlCounts[p] ?? 0) * price, 0)
  const mrrINR = Object.entries(IN_PRICES).reduce((s, [p, price]) => s + (inCounts[p] ?? 0) * price, 0)

  return NextResponse.json({
    total: totalUsers || profileRows.length,
    paid,
    free,
    planCounts,
    inCounts,
    intlCounts,
    monthlyCount,
    annualCount,
    mrrUSD,
    mrrINR,
  })
}

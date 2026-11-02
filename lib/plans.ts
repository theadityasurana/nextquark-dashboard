// Plans, prices and "is this user paying right now" — kept identical to the
// app (rork repo): PLAN_CONFIGS in lib/billing.ts, hasPaidAccess() in
// lib/subscription.ts (SQL twin: has_paid_access()), entitlements in
// lib/entitlements.ts. Change them together.
//
// The plan is profiles.subscription_plan (starter | pro | ultra); profiles.
// subscription_type is only 'premium' / 'free'. Billing is monthly or
// quarterly; region is profiles.pricing_region (IN = ₹, INTL = $).

export type PlanId = "starter" | "pro" | "ultra"
export type Period = "monthly" | "quarterly"
export type Region = "IN" | "INTL"

export interface PlanPrice {
  id: PlanId
  label: string
  credits: number
  iris: boolean
  interviewsPerMonth: number
  resumes: number
  IN: { monthly: number; quarterly: number }
  INTL: { monthly: number; quarterly: number }
}

export const PLANS: PlanPrice[] = [
  { id: "starter", label: "Starter", credits: 75, iris: true, interviewsPerMonth: 0, resumes: 3,
    IN: { monthly: 499, quarterly: 1199 }, INTL: { monthly: 19.99, quarterly: 47.99 } },
  { id: "pro", label: "Pro", credits: 200, iris: true, interviewsPerMonth: 10, resumes: 5,
    IN: { monthly: 999, quarterly: 2399 }, INTL: { monthly: 39.99, quarterly: 95.99 } },
  { id: "ultra", label: "Ultra", credits: 500, iris: true, interviewsPerMonth: 10, resumes: 5,
    IN: { monthly: 2199, quarterly: 5999 }, INTL: { monthly: 59.99, quarterly: 143.99 } },
]
export const PLAN_IDS: PlanId[] = PLANS.map(p => p.id)
export const FREE_SWIPES_PER_CYCLE = 10
export const PLAN_BY_ID = Object.fromEntries(PLANS.map(p => [p.id, p])) as Record<PlanId, PlanPrice>

// Old store SKUs / plan names still found on some rows.
const LEGACY: Record<string, PlanId> = {
  premium: "pro", nq_premium_monthly: "pro", nq_premium_weekly: "pro", nq_pro_monthly: "pro",
  power: "ultra", max: "ultra", nq_power_monthly: "ultra", nq_power_quarterly: "ultra",
  nq_max_monthly: "ultra", nq_max_quarterly: "ultra", nq_starter_monthly: "starter",
}

export interface SubscriptionRow {
  subscription_type?: string | null
  subscription_plan?: string | null
  subscription_status?: string | null
  subscription_end_date?: string | null
  billing_period?: string | null
  pricing_region?: string | null
}

const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60 * 1000

/** Mirrors the app's hasPaidAccess(): active / grace (+3 days), cancelled until its end date. */
export function hasPaidAccess(r: SubscriptionRow, now = Date.now()): boolean {
  if (r.subscription_type !== "premium") return false
  const status = r.subscription_status || null
  const end = r.subscription_end_date ? new Date(r.subscription_end_date).getTime() : null
  if (status === "cancelled") return end !== null && end > now
  if (status === null || status === "active" || status === "grace_period") return end === null || end + RENEWAL_GRACE_MS > now
  return false
}

/** The paid plan a row names (whether or not it is still in force). */
export function planOf(r: SubscriptionRow): PlanId | null {
  const raw = (r.subscription_plan || "").toLowerCase()
  if ((PLAN_IDS as string[]).includes(raw)) return raw as PlanId
  if (LEGACY[raw]) return LEGACY[raw]
  const t = (r.subscription_type || "").toLowerCase()
  if (t && t !== "free") return LEGACY[t] ?? "pro"
  return null
}

export function periodOf(r: SubscriptionRow): Period {
  return r.billing_period === "quarterly" ? "quarterly" : "monthly"
}

export function regionOf(r: SubscriptionRow): Region {
  return r.pricing_region === "IN" ? "IN" : "INTL"
}

/** Monthly recurring revenue of one paying row, in its region's currency (quarterly ÷ 3). */
export function monthlyRevenue(r: SubscriptionRow): number {
  const plan = planOf(r)
  if (!plan || !hasPaidAccess(r)) return 0
  const price = PLAN_BY_ID[plan][regionOf(r)]
  return periodOf(r) === "quarterly" ? price.quarterly / 3 : price.monthly
}

/** Subscription state for display: active / cancelled (term left) / grace / lapsed / free. */
export function subscriptionState(r: SubscriptionRow): "active" | "cancelled" | "grace" | "lapsed" | "free" {
  if (hasPaidAccess(r)) return r.subscription_status === "cancelled" ? "cancelled" : r.subscription_status === "grace_period" ? "grace" : "active"
  return planOf(r) && (r.subscription_type === "premium" || r.subscription_status === "expired" || r.subscription_status === "payment_failed") ? "lapsed" : "free"
}

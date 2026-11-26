// Admin access for the Iris website sections of this dashboard (A/B experiments, referrals).
// The password is the website's referral-admin password (REFERRAL_ADMIN_KEY on irisjobs.live);
// the browser sends it as `x-admin-key` and we confirm it with the website before doing anything.
export const IRIS_ORIGIN = 'https://irisjobs.live'

const ok = new Map<string, number>()
const TTL_MS = 5 * 60 * 1000

export async function verifyIrisAdmin(req: Request): Promise<string | null> {
  const key = req.headers.get('x-admin-key') || ''
  if (!key) return null
  const seen = ok.get(key)
  if (seen && Date.now() - seen < TTL_MS) return key
  try {
    const r = await fetch(`${IRIS_ORIGIN}/api/referrals/admin?ping=1`, { headers: { 'X-Admin-Key': key }, cache: 'no-store' })
    if (!r.ok) return null
    ok.set(key, Date.now())
    return key
  } catch {
    return null
  }
}

export const denied = () => Response.json({ error: 'Wrong admin password.' }, { status: 401 })

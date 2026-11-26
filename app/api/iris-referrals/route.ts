import { IRIS_ORIGIN, irisAdminKey } from '@/lib/iris-admin'

export const dynamic = 'force-dynamic'

// Proxies the website's referral admin API (partners, Dodo sales, link clicks, payouts),
// so the dashboard can show and edit it without its own copy of the Dodo keys.
async function forward(req: Request, method: string) {
  const key = irisAdminKey()
  if (!key) return Response.json({ error: 'Add REFERRAL_ADMIN_KEY to the dashboard environment (same value as on irisjobs.live).' }, { status: 500 })
  const url = new URL(req.url)
  const target = `${IRIS_ORIGIN}/api/referrals/admin${url.search}`
  const init: RequestInit = { method, headers: { 'X-Admin-Key': key, 'Content-Type': 'application/json' }, cache: 'no-store' }
  if (method === 'POST' || method === 'PATCH') init.body = await req.text()
  const r = await fetch(target, init)
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } })
}

export const GET = (req: Request) => forward(req, 'GET')
export const POST = (req: Request) => forward(req, 'POST')
export const PATCH = (req: Request) => forward(req, 'PATCH')
export const DELETE = (req: Request) => forward(req, 'DELETE')

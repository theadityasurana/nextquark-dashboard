import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendAdminPush } from "@/lib/admin-push"

/**
 * Admin browser push subscriptions, persisted in admin_push_subscriptions so
 * they survive serverless restarts (the old in-memory Set lost them).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const supabase = createAdminClient()

  if (body.action === "subscribe") {
    const sub = body.subscription
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
    }
    const { error } = await supabase.from("admin_push_subscriptions").upsert(
      {
        endpoint: sub.endpoint,
        subscription: { endpoint: sub.endpoint, keys: sub.keys },
        user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "unsubscribe") {
    if (!body.endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 })
    await supabase.from("admin_push_subscriptions").delete().eq("endpoint", body.endpoint)
    return NextResponse.json({ ok: true })
  }

  // Sending to every admin browser is server-side only.
  if (body.action === "send") {
    if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const result = await sendAdminPush({ title: body.title, body: body.message ?? body.body ?? "", url: body.url, tag: body.tag })
    return NextResponse.json({ ok: true, ...result })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function GET() {
  return NextResponse.json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY })
}

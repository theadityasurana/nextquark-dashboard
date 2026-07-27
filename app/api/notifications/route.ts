import { NextRequest, NextResponse } from "next/server"
import webpush from "web-push"

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

// In-memory store (persists across requests in the same process)
// For production, store in Supabase instead
const subscriptions: Set<string> = new Set()

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Subscribe
  if (body.action === "subscribe") {
    subscriptions.add(JSON.stringify(body.subscription))
    return NextResponse.json({ ok: true })
  }

  // Send notification (called internally)
  if (body.action === "send") {
    const { title, message, url, tag } = body
    const payload = JSON.stringify({ title, body: message, url, tag })
    const results = await Promise.allSettled(
      Array.from(subscriptions).map(async (sub) => {
        try {
          await webpush.sendNotification(JSON.parse(sub), payload)
        } catch (err: any) {
          // Remove expired/invalid subscriptions
          if (err.statusCode === 410 || err.statusCode === 404) {
            subscriptions.delete(sub)
          }
          throw err
        }
      })
    )
    const sent = results.filter((r) => r.status === "fulfilled").length
    return NextResponse.json({ ok: true, sent, total: subscriptions.size })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

export async function GET() {
  return NextResponse.json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY })
}

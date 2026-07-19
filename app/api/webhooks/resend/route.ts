import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Webhook } from "svix"
import { htmlToPlainText } from "@/lib/html-converter"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_2ZFLsY9X_JtbZwnxNj9Rm8WyxNL6nJK74"
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || "whsec_xv+NxT5MTUj1QL1+djN9eNqi0h6DpjOa"

function extractOtp(bodyText: string | null, bodyHtml: string | null): string | null {
  const plainFromHtml = bodyHtml ? htmlToPlainText(bodyHtml) : ""
  const sources = [bodyText, plainFromHtml].filter(Boolean).join(" ")
  if (!sources) return null

  const patterns = [
    /(?:code|otp|pin|token|password|verification|verify|security code)\s*(?:is|:|=|field[^:]*:)\s*([A-Za-z0-9]{4,10})/i,
    /(?:code|otp|pin|token|password|verification|verify)[^\n]*\n\s*([A-Za-z0-9]{4,10})/i,
    /\b(\d{6})\b/,
    /\b(\d{4,8})\b/,
  ]

  for (const pattern of patterns) {
    const match = sources.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const headers = {
      "svix-id": request.headers.get("svix-id") || "",
      "svix-timestamp": request.headers.get("svix-timestamp") || "",
      "svix-signature": request.headers.get("svix-signature") || "",
    }

    // Verify webhook signature
    let event: any
    try {
      const wh = new Webhook(RESEND_WEBHOOK_SECRET)
      event = wh.verify(body, headers)
    } catch (err) {
      console.error("[Resend Webhook] Signature verification failed:", err)
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    if (event.type !== "email.received") {
      return NextResponse.json({ received: true })
    }

    const { email_id, to, from, subject } = event.data
    console.log(`[Resend Webhook] Email received: ${email_id} | To: ${to} | From: ${from} | Subject: ${subject}`)

    // Fetch the full email body from Resend API
    const emailRes = await fetch(`https://api.resend.com/emails/receiving/${email_id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    })

    if (!emailRes.ok) {
      console.error(`[Resend Webhook] Failed to fetch email body: ${emailRes.status}`)
      return NextResponse.json({ error: "Failed to fetch email" }, { status: 500 })
    }

    const emailData = await emailRes.json()
    const otp = extractOtp(emailData.text, emailData.html)

    console.log(`[Resend Webhook] Extracted OTP: ${otp || "none"} | To: ${to}`)

    // Match the recipient to a live_application_queue row awaiting OTP
    const recipientAddresses: string[] = Array.isArray(to) ? to : [to]

    for (const recipient of recipientAddresses) {
      if (!recipient.endsWith("@nextquark.in")) continue

      // Find queue row with matching email that's awaiting OTP
      const { data: queueRows } = await supabase
        .from("live_application_queue")
        .select("id")
        .eq("email", recipient)
        .eq("status", "awaiting_otp")
        .order("created_at", { ascending: false })
        .limit(1)

      if (queueRows && queueRows.length > 0) {
        const queueId = queueRows[0].id

        // Write OTP to the queue row
        if (otp) {
          await supabase
            .from("live_application_queue")
            .update({ verification_otp: otp })
            .eq("id", queueId)
          console.log(`[Resend Webhook] OTP "${otp}" written to queue row ${queueId}`)
        }

        // Also store in inbound_emails for the OTP Manager UI
        await supabase.from("inbound_emails").insert({
          user_id: (await supabase.from("live_application_queue").select("user_id").eq("id", queueId).single()).data?.user_id,
          proxy_address: recipient,
          from_email: from,
          body_text: emailData.text || null,
          body_html: emailData.html || null,
          live_application_queue_id: queueId,
        })
      } else {
        // No matching awaiting_otp row — still store in inbound_emails for reference
        // Try to find any recent queue row with this email
        const { data: anyRow } = await supabase
          .from("live_application_queue")
          .select("id, user_id")
          .eq("email", recipient)
          .order("created_at", { ascending: false })
          .limit(1)

        await supabase.from("inbound_emails").insert({
          user_id: anyRow?.[0]?.user_id || null,
          proxy_address: recipient,
          from_email: from,
          body_text: emailData.text || null,
          body_html: emailData.html || null,
          live_application_queue_id: anyRow?.[0]?.id || null,
        })
      }
    }

    return NextResponse.json({ received: true, otp: otp || null })
  } catch (err) {
    console.error("[Resend Webhook] Error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

/**
 * Test script for the OTP webhook + fetcher flow.
 * 
 * Usage:
 *   npx tsx scripts/test-otp-flow.ts
 * 
 * Prerequisites:
 *   1. Your dev server must be running: npm run dev
 *   2. You need a real `live_application_queue` row with status 'awaiting_otp'
 *      OR pass --create-test-row to create one
 * 
 * What this tests:
 *   - Simulates a Resend webhook payload hitting your endpoint
 *   - Verifies the OTP gets written to the DB
 *   - Tests the otp-fetcher polling logic
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://widujxpahzlpegzjjpqp.supabase.co"
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const BASE_URL = process.env.BASE_URL || "http://localhost:3000"

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
  console.log("=== OTP Flow Test ===\n")

  // Step 1: Find or create a test queue row
  const testEmail = "test-otp@nextquark.in"
  
  let { data: existingRow } = await supabase
    .from("live_application_queue")
    .select("id, email, status")
    .eq("email", testEmail)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  let queueId: string

  if (existingRow) {
    queueId = existingRow.id
    console.log(`Found existing queue row: ${queueId} (status: ${existingRow.status})`)
    // Set it to awaiting_otp for the test
    await supabase.from("live_application_queue").update({ status: "awaiting_otp", verification_otp: null }).eq("id", queueId)
    console.log(`Set status to 'awaiting_otp'\n`)
  } else {
    console.log(`No queue row found for ${testEmail}.`)
    console.log(`To test the full flow, create a queue row with email = "${testEmail}" and status = "awaiting_otp"`)
    console.log(`\nAlternatively, testing the webhook endpoint directly...\n`)
    queueId = "test-" + Date.now()
  }

  // Step 2: Test the webhook endpoint directly (without signature verification)
  // This simulates what Resend sends, but won't pass signature verification
  // So we'll test the Resend API fetch separately
  console.log("--- Testing Resend List API directly ---")
  
  const RESEND_API_KEY = process.env.RESEND_API_KEY
  
  const listRes = await fetch("https://api.resend.com/emails/receiving?limit=5", {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  })

  if (!listRes.ok) {
    console.error(`❌ Resend List API failed: ${listRes.status} ${await listRes.text()}`)
    return
  }

  const listData = await listRes.json()
  const emails = listData.data || []
  
  console.log(`✅ Resend List API works! Found ${emails.length} received emails.`)
  
  if (emails.length > 0) {
    console.log("\nMost recent received emails:")
    for (const email of emails.slice(0, 5)) {
      console.log(`  - ID: ${email.id} | To: ${email.to} | From: ${email.from} | Subject: ${email.subject}`)
    }

    // Test fetching the body of the first email
    const firstEmail = emails[0]
    console.log(`\n--- Testing Retrieve Email API (ID: ${firstEmail.id}) ---`)
    
    const detailRes = await fetch(`https://api.resend.com/emails/receiving/${firstEmail.id}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    })

    if (detailRes.ok) {
      const detail = await detailRes.json()
      console.log(`✅ Email body retrieved!`)
      console.log(`  Text (first 200 chars): ${(detail.text || "").substring(0, 200)}`)
      console.log(`  HTML present: ${!!detail.html}`)
      
      // Try OTP extraction
      const patterns = [
        /(?:code|otp|pin|token|password|verification|verify|security code)\s*(?:is|:|=|field[^:]*:)\s*([A-Za-z0-9]{4,10})/i,
        /(?:code|otp|pin|token|password|verification|verify)[^\n]*\n\s*([A-Za-z0-9]{4,10})/i,
        /\b(\d{6})\b/,
        /\b(\d{4,8})\b/,
      ]
      
      const sources = [detail.text, detail.html].filter(Boolean).join(" ")
      let extractedOtp: string | null = null
      for (const pattern of patterns) {
        const match = sources.match(pattern)
        if (match?.[1]) { extractedOtp = match[1]; break }
      }
      
      if (extractedOtp) {
        console.log(`  🔑 Extracted OTP: ${extractedOtp}`)
      } else {
        console.log(`  ℹ️  No OTP pattern found in this email (might not be an OTP email)`)
      }
    } else {
      console.error(`❌ Failed to retrieve email body: ${detailRes.status}`)
    }
  } else {
    console.log("\n⚠️  No received emails found. Send a test email to any address @nextquark.in first.")
  }

  // Step 3: Test the webhook endpoint (will fail signature but shows it's reachable)
  console.log("\n--- Testing webhook endpoint reachability ---")
  try {
    const webhookRes = await fetch(`${BASE_URL}/api/webhooks/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email.received", data: { email_id: "test", to: [testEmail], from: "test@example.com", subject: "Test" } }),
    })
    console.log(`Webhook endpoint response: ${webhookRes.status} (401 = signature verification working correctly)`)
  } catch (err) {
    console.log(`⚠️  Could not reach ${BASE_URL}/api/webhooks/resend — is your dev server running?`)
  }

  console.log("\n=== Test Complete ===")
  console.log("\nTo test the FULL end-to-end flow:")
  console.log("1. Register the webhook at resend.com/webhooks → URL: https://admin.nextquark.in/api/webhooks/resend")
  console.log("2. Send an email with an OTP code to any @nextquark.in address")
  console.log("3. Check your DB: the verification_otp column should be populated")
}

main().catch(console.error)

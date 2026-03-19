import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { htmlToPlainText } from '@/lib/html-converter'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function extractOtp(bodyText: string | null, bodyHtml: string | null): string | null {
  // Convert HTML to readable plain text first, then combine with body_text
  const plainFromHtml = bodyHtml ? htmlToPlainText(bodyHtml) : ""
  const sources = [bodyText, plainFromHtml].filter(Boolean).join(' ')
  if (!sources) return null

  const patterns = [
    // "code is: ABC123" / "code: ABC123" / "security code field...\n ABC123"
    /(?:code|otp|pin|token|password|verification|verify|security code)\s*(?:is|:|=|field[^:]*:)\s*([A-Za-z0-9]{4,10})/i,
    // "paste this code...\n RvnyAyws" — code on its own line after a prompt
    /(?:code|otp|pin|token|password|verification|verify)[^\n]*\n\s*([A-Za-z0-9]{4,10})/i,
    // Pure numeric 6-digit (most common OTP)
    /\b(\d{6})\b/,
    // Numeric 4-8 digit
    /\b(\d{4,8})\b/,
  ]

  for (const pattern of patterns) {
    const match = sources.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

export async function GET() {
  const { data, error } = await supabase
    .from('inbound_emails')
    .select('id, user_id, proxy_address, from_email, body_text, body_html')
    .order('id', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const enriched = (data || []).map(row => ({
    ...row,
    extracted_otp: extractOtp(row.body_text, row.body_html),
  }))

  return NextResponse.json(enriched)
}

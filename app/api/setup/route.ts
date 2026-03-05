import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Test if companies table exists by trying to select from it
  const { error: testError } = await supabase.from("companies").select("id").limit(1)

  if (testError && testError.code === "42P01") {
    // Table doesn't exist - need to create via SQL editor
    return NextResponse.json({
      error: "Tables not created yet",
      message: "Please run the SQL from scripts/001_create_tables.sql in your Supabase SQL Editor at https://supabase.com/dashboard/project/widujxpahzlpegzjjpqp/sql",
    }, { status: 400 })
  }

  return NextResponse.json({ success: true, message: "Tables exist and are ready!" })
}

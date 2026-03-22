import { createClient } from "@supabase/supabase-js"
import { clearCachedBrowserUseKey } from "@/lib/browser-use"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .single()

    if (error && error.code !== "PGRST116") {
      throw error
    }

    return Response.json(data || {})
  } catch (error) {
    console.error("Settings fetch error:", error)
    return Response.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { browserUseApiKey } = body

    const updateData: Record<string, any> = { id: 1 }
    if (browserUseApiKey !== undefined) updateData.browserUseApiKey = browserUseApiKey

    const { data, error } = await supabase
      .from("settings")
      .upsert(updateData, { onConflict: "id" })
      .select()
      .single()

    if (error) throw error

    clearCachedBrowserUseKey()

    return Response.json({
      success: true,
      message: "Settings updated successfully",
    })
  } catch (error) {
    console.error("Settings update error:", error)
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 500 }
    )
  }
}

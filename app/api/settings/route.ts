import { createAdminClient } from '@/lib/supabase/admin'
import { clearCachedBrowserUseKey } from "@/lib/browser-use"
import { clearCachedBrowserbaseKeys } from "@/lib/browserbase"
import { clearCachedKernelKey } from "@/lib/kernel"
import { clearCachedProvider } from "@/lib/automation-provider"

const supabase = createAdminClient()

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
    const { browserUseApiKey, browserbaseApiKey, browserbaseProjectId, geminiApiKey, kernelApiKey, openAiApiKey, captchaSolverApiKey, automationProvider, ui_preferences, application_submitted_emails_enabled } = body

    const updateData: Record<string, any> = { id: 1 }
    if (browserUseApiKey !== undefined) updateData.browserUseApiKey = browserUseApiKey
    if (browserbaseApiKey !== undefined) updateData.browserbaseApiKey = browserbaseApiKey
    if (browserbaseProjectId !== undefined) updateData.browserbaseProjectId = browserbaseProjectId
    if (geminiApiKey !== undefined) updateData.geminiApiKey = geminiApiKey
    if (kernelApiKey !== undefined) updateData.kernelApiKey = kernelApiKey
    if (openAiApiKey !== undefined) updateData.openAiApiKey = openAiApiKey
    if (captchaSolverApiKey !== undefined) updateData.captchaSolverApiKey = captchaSolverApiKey
    if (automationProvider !== undefined) updateData.automationProvider = automationProvider
    if (ui_preferences !== undefined) updateData.ui_preferences = ui_preferences
    if (application_submitted_emails_enabled !== undefined) updateData.application_submitted_emails_enabled = application_submitted_emails_enabled

    const { data, error } = await supabase
      .from("settings")
      .upsert(updateData, { onConflict: "id" })
      .select()
      .single()

    if (error) throw error

    // Clear all caches so next run picks up new values
    clearCachedBrowserUseKey()
    clearCachedBrowserbaseKeys()
    clearCachedKernelKey()
    clearCachedProvider()

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

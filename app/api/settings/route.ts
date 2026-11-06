import { createAdminClient } from '@/lib/supabase/admin'
import { clearCachedBrowserUseKey } from "@/lib/browser-use"
import { clearCachedBrowserbaseKeys } from "@/lib/browserbase"
import { clearCachedKernelKey } from "@/lib/kernel"
import { clearCachedProvider } from "@/lib/automation-provider"

const supabase = createAdminClient()

const SECRET_COLUMN = /key|secret|token|password/i
/** Marks a value as masked, so a save that echoes it back cannot overwrite the key. */
const MASK = "••••"

function maskSecrets(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) =>
      SECRET_COLUMN.test(column) && typeof value === "string" && value
        ? [column, `${MASK}${value.slice(-4)}`]
        : [column, value]
    )
  )
}

const isNewValue = (value: unknown) =>
  value !== undefined && !(typeof value === "string" && value.startsWith(MASK))

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .single()

    if (error && error.code !== "PGRST116") {
      throw error
    }

    return Response.json(maskSecrets(data || {}))
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
    if (isNewValue(browserUseApiKey)) updateData.browserUseApiKey = browserUseApiKey
    if (isNewValue(browserbaseApiKey)) updateData.browserbaseApiKey = browserbaseApiKey
    if (browserbaseProjectId !== undefined) updateData.browserbaseProjectId = browserbaseProjectId
    if (isNewValue(geminiApiKey)) updateData.geminiApiKey = geminiApiKey
    if (isNewValue(kernelApiKey)) updateData.kernelApiKey = kernelApiKey
    if (isNewValue(openAiApiKey)) updateData.openAiApiKey = openAiApiKey
    if (isNewValue(captchaSolverApiKey)) updateData.captchaSolverApiKey = captchaSolverApiKey
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

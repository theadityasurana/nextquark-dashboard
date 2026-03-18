import { createClient } from "@supabase/supabase-js"
import { fillJobApplicationWithStreaming, type SkyvernResponse, type StreamCallback } from "./skyvern"
import { fillJobApplicationWithBrowserUse } from "./browser-use"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export type AutomationProvider = "skyvern" | "browser_use"

let cachedProvider: AutomationProvider | null = null
let cacheTimestamp = 0
const CACHE_TTL = 30_000 // 30s

export async function getAutomationProvider(): Promise<AutomationProvider> {
  if (cachedProvider && Date.now() - cacheTimestamp < CACHE_TTL) return cachedProvider
  try {
    const { data } = await supabase.from("settings").select("automationProvider").single()
    cachedProvider = (data?.automationProvider as AutomationProvider) || "skyvern"
    cacheTimestamp = Date.now()
    return cachedProvider
  } catch {
    return "skyvern"
  }
}

export function clearProviderCache() {
  cachedProvider = null
  cacheTimestamp = 0
}

export async function fillJobApplication(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string,
  userId?: string
): Promise<SkyvernResponse> {
  const provider = await getAutomationProvider()
  console.log(`[AutomationProvider] Using: ${provider}`)

  if (provider === "browser_use") {
    return fillJobApplicationWithBrowserUse(portalUrl, userData, onStep, applicationId, userId)
  }
  return fillJobApplicationWithStreaming(portalUrl, userData, onStep, applicationId)
}

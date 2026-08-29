import { fillJobApplicationWithBrowserUse } from "./browser-use"
import { fillJobApplicationWithBrowserbase } from "./browserbase"
import { fillJobApplicationWithKernel } from "./kernel"
import type { AutomationResponse, StreamCallback } from "./browser-use"
import { createClient } from "@supabase/supabase-js"

export type { AutomationResponse, StreamCallback }

let cachedProvider: string | null = null

async function getProvider(): Promise<string> {
  if (cachedProvider) return cachedProvider

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase.from("settings").select("*").single()
    cachedProvider = data?.automationProvider || "browser_use"
  } catch {
    cachedProvider = process.env.AUTOMATION_PROVIDER || "browser_use"
  }

  return cachedProvider!
}

export function clearCachedProvider() {
  cachedProvider = null
}

export async function fillJobApplication(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string,
  userId?: string
): Promise<AutomationResponse> {
  const provider = await getProvider()

  if (provider === "browserbase") {
    return fillJobApplicationWithBrowserbase(portalUrl, userData, onStep, applicationId, userId)
  }

  if (provider === "kernel") {
    return fillJobApplicationWithKernel(portalUrl, userData, onStep, applicationId, userId)
  }

  return fillJobApplicationWithBrowserUse(portalUrl, userData, onStep, applicationId, userId)
}

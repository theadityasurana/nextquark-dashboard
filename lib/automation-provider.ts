import { fillJobApplicationWithBrowserUse } from "./browser-use"
import type { AutomationResponse, StreamCallback } from "./browser-use"

export type { AutomationResponse, StreamCallback }

export async function fillJobApplication(
  portalUrl: string,
  userData: any,
  onStep?: StreamCallback,
  applicationId?: string,
  userId?: string
): Promise<AutomationResponse> {
  return fillJobApplicationWithBrowserUse(portalUrl, userData, onStep, applicationId, userId)
}

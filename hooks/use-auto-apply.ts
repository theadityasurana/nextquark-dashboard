import { useState } from "react"

interface AutoApplyResult {
  success: boolean
  applicationId?: string
  message?: string
  error?: string
}

export function useAutoApply() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const autoApply = async (userId: string, jobId: string): Promise<AutoApplyResult> => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/auto-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, jobId }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Failed to submit application")
        return { success: false, error: data.error }
      }

      return data
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(message)
      return { success: false, error: message }
    } finally {
      setLoading(false)
    }
  }

  return { autoApply, loading, error }
}

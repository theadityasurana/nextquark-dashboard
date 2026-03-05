import { useState, useEffect, useCallback } from "react"

export interface ApplicationProgress {
  id: string
  userId: string
  jobId: string
  companyId: string
  status: "queued" | "processing" | "completed" | "failed"
  progressStep: number
  totalSteps: number
  stepDescription: string
  errorMessage?: string
  progressPercentage: number
  startedAt: string
  completedAt?: string
  createdAt: string
}

export interface QueueResponse {
  success: boolean
  data: ApplicationProgress[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

interface UseApplicationQueueOptions {
  apiUrl: string
  pollInterval?: number
  status?: string
  userId?: string
  limit?: number
}

export function useApplicationQueue({
  apiUrl,
  pollInterval = 3000,
  status,
  userId,
  limit = 50,
}: UseApplicationQueueOptions) {
  const [applications, setApplications] = useState<ApplicationProgress[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    total: 0,
    limit,
    offset: 0,
    hasMore: false,
  })

  const fetchQueue = useCallback(async (offset = 0) => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      })

      if (status) params.append("status", status)
      if (userId) params.append("userId", userId)

      const response = await fetch(
        `${apiUrl}/api/applications/queue?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error("Failed to fetch applications")
      }

      const data: QueueResponse = await response.json()

      if (data.success) {
        setApplications(data.data)
        setPagination(data.pagination)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [apiUrl, status, userId, limit])

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(() => fetchQueue(), pollInterval)
    return () => clearInterval(interval)
  }, [fetchQueue, pollInterval])

  return {
    applications,
    loading,
    error,
    pagination,
    refetch: fetchQueue,
  }
}

interface UseApplicationProgressOptions {
  apiUrl: string
  applicationId?: string
  userId?: string
  pollInterval?: number
}

export function useApplicationProgress({
  apiUrl,
  applicationId,
  userId,
  pollInterval = 2000,
}: UseApplicationProgressOptions) {
  const [progress, setProgress] = useState<ApplicationProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProgress = useCallback(async () => {
    if (!applicationId && !userId) return

    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (applicationId) params.append("applicationId", applicationId)
      if (userId) params.append("userId", userId)

      const response = await fetch(
        `${apiUrl}/api/applications/progress?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error("Failed to fetch progress")
      }

      const data = await response.json()

      if (data.success) {
        setProgress(data.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [apiUrl, applicationId, userId])

  useEffect(() => {
    if (!applicationId && !userId) return

    fetchProgress()
    const interval = setInterval(() => fetchProgress(), pollInterval)
    return () => clearInterval(interval)
  }, [fetchProgress, pollInterval, applicationId, userId])

  return {
    progress,
    loading,
    error,
    refetch: fetchProgress,
  }
}

interface UseApplicationDetailsOptions {
  apiUrl: string
  applicationId: string
}

export interface ApplicationDetails extends ApplicationProgress {
  user?: {
    id: string
    name: string
    email: string
    phone: string
    location: string
    headline: string
    resumeUrl: string
    coverLetter: string
  }
  job?: {
    id: string
    title: string
    location: string
    type: string
    salaryRange: string
    companyName: string
    portalUrl: string
    jobUrl: string
  }
  company?: {
    id: string
    name: string
    logoInitial: string
    website: string
  }
  duration: string
}

export function useApplicationDetails({
  apiUrl,
  applicationId,
}: UseApplicationDetailsOptions) {
  const [details, setDetails] = useState<ApplicationDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDetails = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(
        `${apiUrl}/api/applications/${applicationId}`
      )

      if (!response.ok) {
        throw new Error("Failed to fetch application details")
      }

      const data = await response.json()

      if (data.success) {
        setDetails(data.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [apiUrl, applicationId])

  useEffect(() => {
    fetchDetails()
    const interval = setInterval(() => fetchDetails(), 2000)
    return () => clearInterval(interval)
  }, [fetchDetails])

  return {
    details,
    loading,
    error,
    refetch: fetchDetails,
  }
}

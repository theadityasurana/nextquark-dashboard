import { useState, useEffect, useCallback } from 'react'

export function useQueueCount() {
  const [pendingCount, setPendingCount] = useState(0)

  const fetchCount = useCallback(async () => {
    try {
      const response = await fetch('/api/live-queue/count')
      const data = await response.json()
      setPendingCount(data.count ?? 0)
    } catch (err) {
      console.error('Failed to fetch queue count:', err)
    }
  }, [])

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [fetchCount])

  return pendingCount
}

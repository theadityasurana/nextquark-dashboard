import { useState, useEffect } from 'react'

export function useQueueCount() {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const fetchCount = async () => {
      try {
        const response = await fetch('/api/live-queue')
        const data = await response.json()
        if (Array.isArray(data)) {
          const pending = data.filter((app: any) => app.status === 'pending').length
          setPendingCount(pending)
        }
      } catch (err) {
        console.error('Failed to fetch queue count:', err)
      }
    }
    
    fetchCount()
    const interval = setInterval(fetchCount, 5000)
    return () => clearInterval(interval)
  }, [])

  return pendingCount
}

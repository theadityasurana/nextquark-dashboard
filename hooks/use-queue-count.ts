import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribes to live_application_queue via Supabase Realtime instead of polling.
 *
 * Old approach: setInterval every 30s → constant API traffic even when nothing changes.
 * New approach: the DB pushes a notification the moment a row's status changes.
 * The count is fetched once on mount, then updated only when a real change arrives.
 */
export function useQueueCount() {
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const supabase = createClient()

    // Initial fetch
    supabase
      .from('live_application_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))

    // Realtime subscription — fires on any INSERT, UPDATE, or DELETE
    const channel = supabase
      .channel('queue-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_application_queue' },
        () => {
          // Re-fetch the count when anything changes in the table
          supabase
            .from('live_application_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
            .then(({ count }) => setPendingCount(count ?? 0))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return pendingCount
}

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
    let timer: ReturnType<typeof setTimeout> | null = null

    const load = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      supabase
        .from('live_application_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count }) => setPendingCount(count ?? 0))
    }
    load()

    // A running application writes its row many times a minute. Coalesce those
    // into one count per 5s instead of one count per write per open tab.
    const schedule = () => {
      if (timer) return
      timer = setTimeout(() => { timer = null; load() }, 5_000)
    }

    const channel = supabase
      .channel('queue-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_application_queue' }, schedule)
      .subscribe()

    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [])

  return pendingCount
}

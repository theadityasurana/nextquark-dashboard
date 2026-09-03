/**
 * useUIPreferences — reads and writes operator UI preferences to Supabase.
 *
 * Preferences are stored in settings.ui_preferences (JSONB, row id=1).
 * This means they persist across devices and browsers — opening the dashboard
 * on a different machine shows the same toggle states and chart ranges.
 *
 * Falls back to localStorage while the initial fetch is in flight, so the UI
 * never flickers to a wrong default on load.
 */
import { useState, useEffect, useCallback, useRef } from 'react'

export interface UIPreferences {
  // Queue page
  autoStart: boolean
  premiumOnly: boolean
  maxConcurrent: number
  // Overview page
  chartRange: string
  companyRange: string
  agentRange: string
  jobRange: string
}

const DEFAULTS: UIPreferences = {
  autoStart: false,
  premiumOnly: false,
  maxConcurrent: 3,
  chartRange: '24h',
  companyRange: '24h',
  agentRange: '24h',
  jobRange: '7d',
}

// localStorage keys used as an instant-read fallback while the DB fetch is in flight
const LS_KEY = 'ui_preferences'

function readLocalStorage(): Partial<UIPreferences> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeLocalStorage(prefs: Partial<UIPreferences>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs))
  } catch {}
}

// Debounce DB writes — don't hit Supabase on every keystroke/toggle
function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function useUIPreferences() {
  // Start from localStorage so there's no flicker while the DB fetch runs
  const [prefs, setPrefsState] = useState<UIPreferences>(() => ({
    ...DEFAULTS,
    ...readLocalStorage(),
  }))
  const [loaded, setLoaded] = useState(false)
  const debouncedPrefs = useDebounce(prefs, 800)
  const isFirstSave = useRef(true)

  // Load from Supabase on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data?.ui_preferences && typeof data.ui_preferences === 'object') {
          const merged = { ...DEFAULTS, ...data.ui_preferences }
          setPrefsState(merged)
          writeLocalStorage(merged)
        }
      })
      .catch(() => { /* keep localStorage values on network error */ })
      .finally(() => setLoaded(true))
  }, [])

  // Save to Supabase whenever debounced prefs change (skip the very first fire
  // which is just the initial value, not a user change)
  useEffect(() => {
    if (!loaded) return
    if (isFirstSave.current) { isFirstSave.current = false; return }
    writeLocalStorage(debouncedPrefs)
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ui_preferences: debouncedPrefs }),
    }).catch(() => { /* non-fatal — localStorage already has the value */ })
  }, [debouncedPrefs, loaded])

  const setPrefs = useCallback((update: Partial<UIPreferences>) => {
    setPrefsState(prev => ({ ...prev, ...update }))
  }, [])

  return { prefs, setPrefs, loaded }
}
}

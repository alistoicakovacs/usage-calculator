// Theme: 'system' follows the OS; 'light'/'dark' force a palette by stamping
// data-theme on <html>. The choice is persisted locally (it is a device
// preference, not household data, so it never syncs).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'themePref'

function readStored(): ThemePref {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

function apply(pref: ThemePref): void {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

interface ThemeContextValue {
  pref: ThemePref
  setPref: (pref: ThemePref) => void
  /** The palette actually in effect right now ('light' | 'dark'). */
  resolved: 'light' | 'dark'
}

const ThemeCtx = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => readStored())

  useEffect(() => {
    apply(pref)
  }, [pref])

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private-mode storage failures are non-fatal; the theme still applies.
    }
  }, [])

  const [systemDark, setSystemDark] = useState(
    () =>
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' =
    pref === 'system' ? (systemDark ? 'dark' : 'light') : pref

  const value = useMemo(() => ({ pref, setPref, resolved }), [pref, setPref, resolved])
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}

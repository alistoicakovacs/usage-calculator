// App-wide context: database, device id, and live-query helpers.
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getDb } from '../data/db'
import type { RepoContext } from '../data/repos'

const DEVICE_ID_KEY = 'deviceId'

function ensureDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, id)
  return id
}

const AppCtx = createContext<RepoContext | undefined>(undefined)

export function AppProvider({
  children,
  value: override,
}: {
  children: React.ReactNode
  value?: RepoContext
}) {
  const value = useMemo<RepoContext>(
    () => override ?? { db: getDb(), deviceId: ensureDeviceId(), now: () => Date.now() },
    [override],
  )
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useRepoContext(): RepoContext {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useRepoContext must be used inside AppProvider')
  return ctx
}

/**
 * Simple async data hook with manual invalidation via a version counter.
 * Reloads when `deps` change or `refresh` is called.
 */
export function useAsyncData<T>(load: () => Promise<T>, deps: unknown[]): {
  data: T | undefined
  refresh: () => void
} {
  const [data, setData] = useState<T | undefined>(undefined)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    void load().then((result) => {
      if (!cancelled) setData(result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  return { data, refresh: () => setVersion((v) => v + 1) }
}

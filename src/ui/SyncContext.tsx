// Runs the sync loop for the app and exposes its state to the UI.
//
// Sync is strictly a background chore: no screen ever waits on it, and a device
// with no server configured behaves exactly like the local-only app did. The
// decisions worth reviewing all live in `src/sync` — this is the wiring that
// drives them on a timer and re-reads the conflict queue afterwards.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { deriveSyncToken } from '../crypto/keys'
import { listConflicts, resolveConflictById, syncOnce } from '../sync/client'
import { loadServerUrl } from '../sync/settings'
import { backoffDelay, httpTransport } from '../sync/transport'
import type { StoredConflict } from '../sync/state'
import { useRepoContext } from './AppContext'
import { useVault } from './VaultContext'

export type SyncStatus =
  /** No sync server configured; this device is local-only. */
  | 'disabled'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'unauthorized'

export interface SyncContextValue {
  status: SyncStatus
  conflicts: StoredConflict[]
  lastSyncedAt?: number
  syncNow: () => void
  resolve: (conflictId: string, side: 'local' | 'remote') => Promise<void>
}

const SyncCtx = createContext<SyncContextValue | undefined>(undefined)

export function useSync(): SyncContextValue {
  const value = useContext(SyncCtx)
  if (!value) throw new Error('useSync must be used inside SyncProvider')
  return value
}

/**
 * For chrome that is shared with screens rendered outside the sync tree — the
 * app shell has to work in a local-only app and in unit tests alike.
 */
export function useOptionalSync(): SyncContextValue | undefined {
  return useContext(SyncCtx)
}

/** How long to wait between rounds when everything is healthy. */
const IDLE_INTERVAL_MS = 60_000

/**
 * Supplying `value` hands the tree a fixed sync state and starts no engine —
 * that is how screens are tested. The live engine lives in its own component
 * so its hooks (and its database) are never touched on that path.
 */
export function SyncProvider({
  children,
  value: override,
}: {
  children: React.ReactNode
  value?: SyncContextValue
}) {
  if (override) return <SyncCtx.Provider value={override}>{children}</SyncCtx.Provider>
  return <LiveSyncProvider>{children}</LiveSyncProvider>
}

function LiveSyncProvider({ children }: { children: React.ReactNode }) {
  return <SyncCtx.Provider value={useSyncEngine()}>{children}</SyncCtx.Provider>
}

function useSyncEngine(): SyncContextValue {
  const repo = useRepoContext()
  const vault = useVault()

  const [status, setStatus] = useState<SyncStatus>('disabled')
  const [conflicts, setConflicts] = useState<StoredConflict[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<number>()
  const [wakeUp, setWakeUp] = useState(0)

  const syncNow = useCallback(() => setWakeUp((n) => n + 1), [])

  const resolve = useCallback(
    async (conflictId: string, side: 'local' | 'remote') => {
      await resolveConflictById(
        { db: repo.db, vault, deviceId: repo.deviceId, now: repo.now, transport: noTransport },
        conflictId,
        side,
      )
      setConflicts(await listConflicts(repo.db))
      syncNow()
    },
    [repo, vault, syncNow],
  )

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let consecutiveFailures = 0

    const schedule = (delay: number) => {
      if (!cancelled) timer = setTimeout(() => void round(), delay)
    }

    async function round(): Promise<void> {
      const serverUrl = await loadServerUrl(repo.db)
      if (cancelled) return

      if (!serverUrl) {
        setStatus('disabled')
        schedule(IDLE_INTERVAL_MS)
        return
      }

      setStatus('syncing')
      const token = await deriveSyncToken(vault.key, vault.id)
      const outcome = await syncOnce({
        db: repo.db,
        vault,
        deviceId: repo.deviceId,
        now: repo.now,
        transport: httpTransport({ baseUrl: serverUrl, vaultId: vault.id, token }),
      })
      if (cancelled) return

      setConflicts(await listConflicts(repo.db))
      if (cancelled) return

      if (outcome.kind === 'synced') {
        consecutiveFailures = 0
        setStatus('idle')
        setLastSyncedAt(repo.now())
        schedule(IDLE_INTERVAL_MS)
      } else {
        consecutiveFailures += 1
        setStatus(outcome.kind)
        schedule(backoffDelay(consecutiveFailures))
      }
    }

    void round()
    // A device that just regained the network should not sit out the backoff.
    const onOnline = () => {
      consecutiveFailures = 0
      clearTimeout(timer)
      void round()
    }
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      clearTimeout(timer)
      window.removeEventListener('online', onOnline)
    }
  }, [repo, vault, wakeUp])

  return useMemo(
    () => ({ status, conflicts, lastSyncedAt, syncNow, resolve }),
    [status, conflicts, lastSyncedAt, syncNow, resolve],
  )
}

/** `resolveConflictById` only touches local storage; it never calls out. */
const noTransport = {
  push: () => Promise.reject(new Error('not reachable')),
  pull: () => Promise.reject(new Error('not reachable')),
}

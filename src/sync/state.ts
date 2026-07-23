// Per-device sync bookkeeping, kept in the non-replicated `localState` table.
import type { AppDatabase } from '../data/db'
import type { VersionVector } from './merge'
import type { SyncRow, SyncTable } from './protocol'

const STATE_KEY = 'syncState'

export interface StoredConflict {
  /** `${table}:${recordId}` — one pending conflict per record, at most. */
  id: string
  table: SyncTable
  local: SyncRow
  remote: SyncRow
  detectedAt: number
}

export interface SyncState {
  /** Highest server version this device has merged. */
  lastVersion: number
  /**
   * The version of each record we know the server already holds, keyed by
   * `${table}:${recordId}`.
   *
   * The plan called for an `updatedAt` watermark, but a watermark cannot tell
   * "I wrote this" from "I received this a moment ago", so two devices end up
   * bouncing the same record back and forth, and any two writes landing in the
   * same millisecond as the watermark risk being skipped. Recording what the
   * server has is exact and costs one version vector per record.
   */
  known: Record<string, VersionVector>
  /** Records two devices changed independently, awaiting the user's call. */
  conflicts: StoredConflict[]
}

export function emptySyncState(): SyncState {
  return { lastVersion: 0, known: {}, conflicts: [] }
}

export async function loadSyncState(db: AppDatabase): Promise<SyncState> {
  const row = await db.localState.get(STATE_KEY)
  if (!row) return emptySyncState()
  try {
    return { ...emptySyncState(), ...(JSON.parse(row.value) as Partial<SyncState>) }
  } catch {
    // Unreadable bookkeeping is recoverable: a full re-pull rebuilds it.
    return emptySyncState()
  }
}

export async function saveSyncState(db: AppDatabase, state: SyncState): Promise<void> {
  await db.localState.put({ key: STATE_KEY, value: JSON.stringify(state) })
}

// Sync client: one round is pull, merge, then push whatever is still ours.
//
// Nothing here blocks the UI. A round that cannot reach the server changes no
// local data and reports itself offline; the next round picks up where it left
// off. A record the vault key cannot open is skipped rather than written,
// because a blob we cannot read must never be allowed to destroy one we can.
import { decryptRecord, encryptRecord, type VaultKey } from '../crypto/keys'
import type { AppDatabase } from '../data/db'
import { compareVectors, mergeTable, resolveConflict } from './merge'
import {
  recordKey,
  SYNC_TABLES,
  type StoredRecord,
  type SyncRow,
  type SyncTable,
  type SyncTransport,
  type WireRecord,
} from './protocol'
import { loadSyncState, saveSyncState, type StoredConflict, type SyncState } from './state'

export interface SyncDeps {
  db: AppDatabase
  vault: { id: string; key: VaultKey }
  deviceId: string
  now: () => number
  transport: SyncTransport
}

export type SyncOutcome =
  | { kind: 'synced'; pushed: number; pulled: number; conflicts: number }
  | { kind: 'offline' }
  | { kind: 'unauthorized' }

export async function syncOnce(deps: SyncDeps): Promise<SyncOutcome> {
  const state = await loadSyncState(deps.db)

  const pulled = await deps.transport.pull(state.lastVersion)
  if (!pulled.ok) return { kind: pulled.reason === 'unauthorized' ? 'unauthorized' : 'offline' }

  const applied = await applyRemote(deps, state, pulled.records)
  state.lastVersion = pulled.version

  const outbox = await collectOutbox(deps, state)
  let pushed = 0

  if (outbox.length > 0) {
    const result = await deps.transport.push({
      baseVersion: state.lastVersion,
      records: await Promise.all(outbox.map((entry) => seal(deps.vault.key, entry))),
    })

    if (!result.ok && result.reason !== 'stale') {
      // Keep what the pull already merged; the push retries next round.
      await saveSyncState(deps.db, state)
      return { kind: result.reason === 'unauthorized' ? 'unauthorized' : 'offline' }
    }

    if (result.ok) {
      state.lastVersion = result.version
      for (const { table, row } of outbox) {
        state.known[recordKey(table, row.id)] = row.versionVector
      }
      pushed = outbox.length
    } else {
      // Someone pushed between our pull and our push. Take their work; ours
      // goes out on the next round, now composed against a current view.
      await applyRemote(deps, state, result.records)
      state.lastVersion = result.version
    }
  }

  await saveSyncState(deps.db, state)
  return { kind: 'synced', pushed, pulled: applied.written, conflicts: applied.conflicts }
}

interface OutboxEntry {
  table: SyncTable
  row: SyncRow
}

/**
 * Everything whose local version differs from the version the server holds.
 * Records with an unsettled conflict stay home: uploading one would overwrite
 * the very copy the user is being asked to compare against.
 */
async function collectOutbox(deps: SyncDeps, state: SyncState): Promise<OutboxEntry[]> {
  const pending = new Set(state.conflicts.map((conflict) => conflict.id))
  const outbox: OutboxEntry[] = []

  for (const table of SYNC_TABLES) {
    for (const row of await tableOf(deps.db, table).toArray()) {
      const key = recordKey(table, row.id)
      if (pending.has(key)) continue
      const known = state.known[key]
      if (known && compareVectors(row.versionVector, known) === 'same') continue
      outbox.push({ table, row })
    }
  }
  return outbox
}

async function seal(key: VaultKey, { table, row }: OutboxEntry): Promise<WireRecord> {
  return { table, recordId: row.id, envelope: await encryptRecord(key, row) }
}

async function applyRemote(
  deps: SyncDeps,
  state: SyncState,
  records: StoredRecord[],
): Promise<{ written: number; conflicts: number }> {
  const incoming = new Map<SyncTable, SyncRow[]>()

  for (const record of records) {
    const opened = await decryptRecord<SyncRow>(deps.vault.key, record.envelope)
    if (!opened.ok) continue
    const rows = incoming.get(record.table) ?? []
    rows.push(opened.value)
    incoming.set(record.table, rows)
  }

  let written = 0
  let conflicts = 0

  for (const [table, rows] of incoming) {
    const dexieTable = tableOf(deps.db, table)
    const plan = mergeTable(await dexieTable.toArray(), rows)

    for (const row of plan.writes) {
      await dexieTable.put(row)
      written += 1
    }
    for (const conflict of plan.conflicts) {
      if (queueConflict(state, deps.now(), table, conflict.local, conflict.remote)) conflicts += 1
    }
    // Whatever the outcome, the server demonstrably holds the version it just
    // sent us, so there is no reason to send that same version back.
    for (const row of rows) state.known[recordKey(table, row.id)] = row.versionVector
  }

  return { written, conflicts }
}

function queueConflict(
  state: SyncState,
  detectedAt: number,
  table: SyncTable,
  local: SyncRow,
  remote: SyncRow,
): boolean {
  const id = recordKey(table, local.id)
  if (state.conflicts.some((conflict) => conflict.id === id)) return false
  state.conflicts.push({ id, table, local, remote, detectedAt })
  return true
}

export async function listConflicts(db: AppDatabase): Promise<StoredConflict[]> {
  return (await loadSyncState(db)).conflicts
}

/**
 * Record the user's choice. The surviving row is stamped with a version that
 * dominates both sides, so the other device adopts it rather than re-raising
 * the same argument on its next pull.
 */
export async function resolveConflictById(
  deps: SyncDeps,
  conflictId: string,
  side: 'local' | 'remote',
): Promise<void> {
  const state = await loadSyncState(deps.db)
  const conflict = state.conflicts.find((entry) => entry.id === conflictId)
  if (!conflict) return

  const [chosen, rejected] =
    side === 'local' ? [conflict.local, conflict.remote] : [conflict.remote, conflict.local]

  const resolved = resolveConflict(chosen, rejected, { deviceId: deps.deviceId, now: deps.now })
  await tableOf(deps.db, conflict.table).put(resolved)

  state.conflicts = state.conflicts.filter((entry) => entry.id !== conflictId)
  await saveSyncState(deps.db, state)
}

/** Minimal structural view of a Dexie table, mirroring `data/repos.ts`. */
interface TableLike {
  toArray(): Promise<SyncRow[]>
  put(row: SyncRow): Promise<unknown>
}

function tableOf(db: AppDatabase, table: SyncTable): TableLike {
  return db[table] as unknown as TableLike
}

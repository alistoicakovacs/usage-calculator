// The wire contract between the app and the sync worker.
//
// `worker/test/sync.test.ts` pins the server side of this contract down against
// a real workerd instance; anything here that drifts from it is a bug.
import type { Envelope } from '../crypto/keys'
import type { SyncMeta } from '../data/db'

/** Tables that replicate. `localState` is deliberately absent: it is per-device. */
export const SYNC_TABLES = [
  'properties',
  'meters',
  'readings',
  'tariffs',
  'gasConversions',
  'billingPeriods',
] as const

export type SyncTable = (typeof SYNC_TABLES)[number]

/** Any replicated row, viewed only through the metadata sync cares about. */
export interface SyncRow extends SyncMeta {
  id: string
}

/**
 * What the server holds. The id and table travel in the clear because the
 * server addresses records by them; everything the user actually typed is
 * inside the envelope. So the server can count how many readings a vault has,
 * but never what any of them say.
 */
export interface WireRecord {
  table: SyncTable
  recordId: string
  envelope: Envelope
}

export interface StoredRecord extends WireRecord {
  version: number
}

export interface PushRequest {
  /** The server version this push was composed against. */
  baseVersion: number
  records: WireRecord[]
}

export type PushResult =
  | { ok: true; version: number }
  /** Someone else pushed first; `records` is everything we had not seen. */
  | { ok: false; reason: 'stale'; version: number; records: StoredRecord[] }
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'network' }

export type PullResult =
  | { ok: true; version: number; records: StoredRecord[] }
  | { ok: false; reason: 'unauthorized' | 'network' }

export interface SyncTransport {
  push(request: PushRequest): Promise<PushResult>
  pull(since: number): Promise<PullResult>
}

export function recordKey(table: SyncTable, id: string): string {
  return `${table}:${id}`
}

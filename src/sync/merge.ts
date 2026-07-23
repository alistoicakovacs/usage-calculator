// Record-level merge for two-way sync.
//
// Every write stamps a version vector ({ deviceId: counter }), so two copies of
// a record can be compared without trusting anyone's clock. If one copy has
// seen everything the other has, it simply wins. If each has seen something the
// other has not, the edits were genuinely concurrent and only the user can say
// which one they meant — with one exception: two devices deleting the same
// record agreed, even if they did it independently.
import type { SyncMeta } from '../data/db'

export type VersionVector = Record<string, number>

/** How vector `a` relates to vector `b`. */
export type VectorOrder = 'same' | 'ahead' | 'behind' | 'concurrent'

export function compareVectors(a: VersionVector, b: VersionVector): VectorOrder {
  let aLeads = false
  let bLeads = false
  for (const device of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const left = a[device] ?? 0
    const right = b[device] ?? 0
    if (left > right) aLeads = true
    else if (right > left) bLeads = true
  }
  if (aLeads && bLeads) return 'concurrent'
  if (aLeads) return 'ahead'
  if (bLeads) return 'behind'
  return 'same'
}

/** The smallest vector that dominates both inputs. */
export function joinVectors(a: VersionVector, b: VersionVector): VersionVector {
  const joined: VersionVector = { ...a }
  for (const [device, count] of Object.entries(b)) {
    joined[device] = Math.max(joined[device] ?? 0, count)
  }
  return joined
}

export type MergeOutcome<T> =
  | { kind: 'unchanged' }
  | { kind: 'take-remote'; row: T }
  | { kind: 'conflict'; local: T; remote: T }

export function mergeRecord<T extends SyncMeta>(
  local: T | undefined,
  remote: T,
): MergeOutcome<T> {
  if (!local) return { kind: 'take-remote', row: remote }

  switch (compareVectors(local.versionVector, remote.versionVector)) {
    case 'same':
    case 'ahead':
      return { kind: 'unchanged' }
    case 'behind':
      return { kind: 'take-remote', row: remote }
    case 'concurrent':
      return local.deleted && remote.deleted
        ? { kind: 'take-remote', row: settleTombstones(local, remote) }
        : { kind: 'conflict', local, remote }
  }
}

/**
 * Both devices deleted the record, so there is nothing to ask about. The
 * survivor carries the joined vector: without it each device would keep
 * offering the other a tombstone neither one dominates, forever. The pick is
 * made from the records alone so both devices reach the same answer.
 */
function settleTombstones<T extends SyncMeta>(local: T, remote: T): T {
  const winner =
    local.updatedAt !== remote.updatedAt
      ? (local.updatedAt > remote.updatedAt ? local : remote)
      : (local.deviceId >= remote.deviceId ? local : remote)
  return { ...winner, versionVector: joinVectors(local.versionVector, remote.versionVector) }
}

export interface Conflict<T> {
  local: T
  remote: T
}

export interface MergePlan<T> {
  /** Rows to write locally, already in their winning form. */
  writes: T[]
  /** Rows the user has to choose between. Nothing is written for these. */
  conflicts: Conflict<T>[]
}

/**
 * Merge one table's worth of incoming rows against what is already here.
 * Local rows the remote has never heard of are left alone — they are this
 * device's own work, and the outbox will send them on the next push.
 */
export function mergeTable<T extends SyncMeta & { id: string }>(
  locals: T[],
  remotes: T[],
): MergePlan<T> {
  const byId = new Map(locals.map((row) => [row.id, row]))
  const plan: MergePlan<T> = { writes: [], conflicts: [] }

  for (const remote of remotes) {
    const outcome = mergeRecord(byId.get(remote.id), remote)
    if (outcome.kind === 'take-remote') plan.writes.push(outcome.row)
    else if (outcome.kind === 'conflict') {
      plan.conflicts.push({ local: outcome.local, remote: outcome.remote })
    }
  }
  return plan
}

export interface ResolveContext {
  deviceId: string
  now: () => number
}

/**
 * Turn a user's choice into a version that dominates both sides, so the losing
 * copy is superseded everywhere instead of resurfacing on the next sync.
 */
export function resolveConflict<T extends SyncMeta>(
  chosen: T,
  rejected: T,
  ctx: ResolveContext,
): T {
  const versionVector = joinVectors(chosen.versionVector, rejected.versionVector)
  versionVector[ctx.deviceId] = (versionVector[ctx.deviceId] ?? 0) + 1

  const resolved = { ...chosen, versionVector, updatedAt: ctx.now(), deviceId: ctx.deviceId }
  // Choosing the surviving copy over a tombstone must actually revive it.
  if (!chosen.deleted) delete resolved.deleted
  return resolved
}

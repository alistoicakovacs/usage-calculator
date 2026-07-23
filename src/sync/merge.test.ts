import { describe, expect, it } from 'vitest'
import type { SyncMeta } from '../data/db'
import { compareVectors, joinVectors, mergeRecord, mergeTable, resolveConflict } from './merge'

interface Row extends SyncMeta {
  id: string
  value: string
}

const A = 'device-a'
const B = 'device-b'

function row(overrides: Partial<Row> & { versionVector: Record<string, number> }): Row {
  return {
    id: 'r1',
    value: 'v',
    updatedAt: 1_000,
    deviceId: A,
    ...overrides,
  }
}

describe('compareVectors', () => {
  it('calls identical vectors the same', () => {
    expect(compareVectors({ [A]: 2 }, { [A]: 2 })).toBe('same')
  })

  it('treats a missing device as a zero count', () => {
    expect(compareVectors({ [A]: 1 }, { [A]: 1, [B]: 0 })).toBe('same')
  })

  it('calls a strictly higher vector ahead', () => {
    expect(compareVectors({ [A]: 3 }, { [A]: 2 })).toBe('ahead')
  })

  it('calls a strictly lower vector behind', () => {
    expect(compareVectors({ [A]: 2 }, { [A]: 3 })).toBe('behind')
  })

  it('counts a vector that only adds a new device as ahead', () => {
    expect(compareVectors({ [A]: 2, [B]: 1 }, { [A]: 2 })).toBe('ahead')
  })

  it('calls vectors that each lead on a different device concurrent', () => {
    expect(compareVectors({ [A]: 2, [B]: 1 }, { [A]: 1, [B]: 2 })).toBe('concurrent')
  })

  it('follows a dominance chain transitively', () => {
    const v1 = { [A]: 1 }
    const v2 = { [A]: 1, [B]: 1 }
    const v3 = { [A]: 2, [B]: 1 }

    expect(compareVectors(v2, v1)).toBe('ahead')
    expect(compareVectors(v3, v2)).toBe('ahead')
    expect(compareVectors(v3, v1)).toBe('ahead')
  })
})

describe('joinVectors', () => {
  it('takes the highest count seen for each device', () => {
    expect(joinVectors({ [A]: 3, [B]: 1 }, { [A]: 1, [B]: 5 })).toEqual({ [A]: 3, [B]: 5 })
  })

  it('keeps devices present on only one side', () => {
    expect(joinVectors({ [A]: 1 }, { [B]: 2 })).toEqual({ [A]: 1, [B]: 2 })
  })

  it('dominates both inputs', () => {
    const a = { [A]: 2, [B]: 1 }
    const b = { [A]: 1, [B]: 2 }

    const joined = joinVectors(a, b)

    expect(compareVectors(joined, a)).toBe('ahead')
    expect(compareVectors(joined, b)).toBe('ahead')
  })
})

describe('mergeRecord', () => {
  it('accepts a record this device has never seen', () => {
    const remote = row({ versionVector: { [B]: 1 } })

    expect(mergeRecord(undefined, remote)).toEqual({ kind: 'take-remote', row: remote })
  })

  it('ignores a remote copy the local one already dominates', () => {
    const local = row({ versionVector: { [A]: 2 }, value: 'newer' })
    const remote = row({ versionVector: { [A]: 1 }, value: 'older' })

    expect(mergeRecord(local, remote)).toEqual({ kind: 'unchanged' })
  })

  it('ignores an identical remote copy', () => {
    const local = row({ versionVector: { [A]: 1 } })
    const remote = row({ versionVector: { [A]: 1 } })

    expect(mergeRecord(local, remote)).toEqual({ kind: 'unchanged' })
  })

  it('takes a remote copy that dominates the local one', () => {
    const local = row({ versionVector: { [A]: 1 }, value: 'older' })
    const remote = row({ versionVector: { [A]: 1, [B]: 1 }, value: 'newer' })

    expect(mergeRecord(local, remote)).toEqual({ kind: 'take-remote', row: remote })
  })

  it('reports concurrent edits to the same record as a conflict', () => {
    const local = row({ versionVector: { [A]: 2, [B]: 1 }, value: 'mine' })
    const remote = row({ versionVector: { [A]: 1, [B]: 2 }, value: 'theirs' })

    expect(mergeRecord(local, remote)).toEqual({ kind: 'conflict', local, remote })
  })

  it('reports a delete racing an edit as a conflict', () => {
    const local = row({ versionVector: { [A]: 2, [B]: 1 }, deleted: true })
    const remote = row({ versionVector: { [A]: 1, [B]: 2 }, value: 'still wanted' })

    expect(mergeRecord(local, remote)).toEqual({ kind: 'conflict', local, remote })
  })

  it('reports an edit racing a delete as a conflict', () => {
    const local = row({ versionVector: { [A]: 2, [B]: 1 }, value: 'still wanted' })
    const remote = row({ versionVector: { [A]: 1, [B]: 2 }, deleted: true })

    expect(mergeRecord(local, remote)).toEqual({ kind: 'conflict', local, remote })
  })

  it('settles concurrent deletes without asking the user', () => {
    const local = row({ versionVector: { [A]: 2, [B]: 1 }, deleted: true })
    const remote = row({ versionVector: { [A]: 1, [B]: 2 }, deleted: true })

    const result = mergeRecord(local, remote)

    expect(result.kind).toBe('take-remote')
  })

  it('settles concurrent deletes on a version that outranks both sides', () => {
    // Otherwise the two devices keep re-offering each other the same tombstone.
    const local = row({ versionVector: { [A]: 2, [B]: 1 }, deleted: true })
    const remote = row({ versionVector: { [A]: 1, [B]: 2 }, deleted: true })

    const result = mergeRecord(local, remote)

    if (result.kind !== 'take-remote') throw new Error('expected a silent resolution')
    expect(result.row.deleted).toBe(true)
    expect(compareVectors(result.row.versionVector, local.versionVector)).toBe('ahead')
    expect(compareVectors(result.row.versionVector, remote.versionVector)).toBe('ahead')
  })

  it('settles concurrent deletes the same way on both devices', () => {
    const local = row({ versionVector: { [A]: 2, [B]: 1 }, deleted: true, updatedAt: 5 })
    const remote = row({ versionVector: { [A]: 1, [B]: 2 }, deleted: true, updatedAt: 9 })

    const here = mergeRecord(local, remote)
    const there = mergeRecord(remote, local)

    expect(here).toEqual(there)
  })
})

describe('resolveConflict', () => {
  it('keeps the values of the side the user chose', () => {
    const mine = row({ versionVector: { [A]: 2, [B]: 1 }, value: 'mine' })
    const theirs = row({ versionVector: { [A]: 1, [B]: 2 }, value: 'theirs' })

    const resolved = resolveConflict(theirs, mine, { deviceId: A, now: () => 7_000 })

    expect(resolved.value).toBe('theirs')
  })

  it('outranks both sides so the conflict cannot come back', () => {
    const mine = row({ versionVector: { [A]: 2, [B]: 1 }, value: 'mine' })
    const theirs = row({ versionVector: { [A]: 1, [B]: 2 }, value: 'theirs' })

    const resolved = resolveConflict(theirs, mine, { deviceId: A, now: () => 7_000 })

    expect(compareVectors(resolved.versionVector, mine.versionVector)).toBe('ahead')
    expect(compareVectors(resolved.versionVector, theirs.versionVector)).toBe('ahead')
  })

  it('stamps the resolving device and time', () => {
    const mine = row({ versionVector: { [A]: 2, [B]: 1 }, value: 'mine' })
    const theirs = row({ versionVector: { [A]: 1, [B]: 2 }, value: 'theirs' })

    const resolved = resolveConflict(theirs, mine, { deviceId: A, now: () => 7_000 })

    expect(resolved.deviceId).toBe(A)
    expect(resolved.updatedAt).toBe(7_000)
    expect(resolved.versionVector[A]).toBe(3)
  })

  it('can resolve in favour of a delete', () => {
    const mine = row({ versionVector: { [A]: 2, [B]: 1 }, value: 'mine' })
    const theirs = row({ versionVector: { [A]: 1, [B]: 2 }, deleted: true })

    const resolved = resolveConflict(theirs, mine, { deviceId: A, now: () => 7_000 })

    expect(resolved.deleted).toBe(true)
  })

  it('drops the tombstone when the user resurrects the record', () => {
    const mine = row({ versionVector: { [A]: 2, [B]: 1 }, value: 'still wanted' })
    const theirs = row({ versionVector: { [A]: 1, [B]: 2 }, deleted: true })

    const resolved = resolveConflict(mine, theirs, { deviceId: A, now: () => 7_000 })

    expect(resolved.deleted).toBeUndefined()
    expect(resolved.value).toBe('still wanted')
  })
})

// Each case sets up what two devices did while apart, then merges in both
// directions. Sync is only correct if both ends land in the same place.
describe('two devices, merged both ways', () => {
  function exchange(a: Row[], b: Row[]) {
    return { onA: mergeTable(a, b), onB: mergeTable(b, a) }
  }

  function apply(rows: Row[], writes: Row[]): Row[] {
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const w of writes) byId.set(w.id, w)
    return [...byId.values()].sort((x, y) => x.id.localeCompare(y.id))
  }

  it('merges independent additions without a word', () => {
    const onDeviceA = [row({ id: 'r1', versionVector: { [A]: 1 } })]
    const onDeviceB = [row({ id: 'r2', versionVector: { [B]: 1 } })]

    const { onA, onB } = exchange(onDeviceA, onDeviceB)

    expect(onA.conflicts).toEqual([])
    expect(onB.conflicts).toEqual([])
    expect(apply(onDeviceA, onA.writes)).toEqual(apply(onDeviceB, onB.writes))
  })

  it('carries an edit to the device that never saw it', () => {
    const shared = row({ id: 'r1', versionVector: { [A]: 1 }, value: 'original' })
    const edited = row({ id: 'r1', versionVector: { [A]: 1, [B]: 1 }, value: 'edited' })

    const { onA, onB } = exchange([shared], [edited])

    expect(onA.writes).toEqual([edited])
    expect(onB.writes).toEqual([])
    expect(apply([shared], onA.writes)).toEqual(apply([edited], onB.writes))
  })

  it('reports the same conflict on both devices when each edited the record', () => {
    const mine = row({ id: 'r1', versionVector: { [A]: 2, [B]: 1 }, value: 'mine' })
    const theirs = row({ id: 'r1', versionVector: { [A]: 1, [B]: 2 }, value: 'theirs' })

    const { onA, onB } = exchange([mine], [theirs])

    expect(onA.writes).toEqual([])
    expect(onA.conflicts).toEqual([{ local: mine, remote: theirs }])
    expect(onB.conflicts).toEqual([{ local: theirs, remote: mine }])
  })

  it('reports a conflict when one device deleted what the other edited', () => {
    const deleted = row({ id: 'r1', versionVector: { [A]: 2, [B]: 1 }, deleted: true })
    const edited = row({ id: 'r1', versionVector: { [A]: 1, [B]: 2 }, value: 'still wanted' })

    const { onA, onB } = exchange([deleted], [edited])

    expect(onA.conflicts).toHaveLength(1)
    expect(onB.conflicts).toHaveLength(1)
  })

  it('converges silently when both devices deleted the record', () => {
    const here = row({ id: 'r1', versionVector: { [A]: 2, [B]: 1 }, deleted: true, updatedAt: 5 })
    const there = row({ id: 'r1', versionVector: { [A]: 1, [B]: 2 }, deleted: true, updatedAt: 9 })

    const { onA, onB } = exchange([here], [there])

    expect(onA.conflicts).toEqual([])
    expect(onB.conflicts).toEqual([])
    expect(apply([here], onA.writes)).toEqual(apply([there], onB.writes))
  })

  it('leaves nothing to exchange on a second round', () => {
    const here = row({ id: 'r1', versionVector: { [A]: 2, [B]: 1 }, deleted: true, updatedAt: 5 })
    const there = row({ id: 'r1', versionVector: { [A]: 1, [B]: 2 }, deleted: true, updatedAt: 9 })

    const first = exchange([here], [there])
    const settledA = apply([here], first.onA.writes)
    const settledB = apply([there], first.onB.writes)
    const second = exchange(settledA, settledB)

    expect(second.onA.writes).toEqual([])
    expect(second.onB.writes).toEqual([])
  })

  it('resolving a conflict on one device settles it on the other', () => {
    const mine = row({ id: 'r1', versionVector: { [A]: 2, [B]: 1 }, value: 'mine' })
    const theirs = row({ id: 'r1', versionVector: { [A]: 1, [B]: 2 }, value: 'theirs' })

    const resolved = resolveConflict(theirs, mine, { deviceId: A, now: () => 9_000 })
    const { onB } = exchange([resolved], [theirs])

    expect(onB.conflicts).toEqual([])
    expect(onB.writes).toEqual([resolved])
  })
})

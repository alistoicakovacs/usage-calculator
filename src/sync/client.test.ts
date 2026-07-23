import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type AppDatabase, type PropertyRow } from '../data/db'
import { meterRepo, propertyRepo, readingRepo, type RepoContext } from '../data/repos'
import { generateVaultKey, type VaultKey } from '../crypto/keys'
import type { StoredRecord, SyncRow, SyncTransport, WireRecord } from './protocol'
import { listConflicts, resolveConflictById, syncOnce, type SyncDeps } from './client'

const VAULT_ID = 'vault-under-test'

/** Conflicts are carried as bare sync rows; tests care about the payload. */
const labelOf = (row: SyncRow) => (row as PropertyRow).label

/**
 * Stands in for the deployed worker. It mirrors the protocol the miniflare
 * tests in `worker/test/sync.test.ts` pin down — those are the source of truth
 * for server behaviour; this exists so the client can be driven without a
 * network.
 */
function fakeServer() {
  let version = 0
  const records = new Map<string, StoredRecord>()
  let offline = false
  let beforePush: (() => void) | undefined

  const since = (v: number) => [...records.values()].filter((r) => r.version > v)

  const transport: SyncTransport = {
    async pull(from) {
      if (offline) return { ok: false, reason: 'network' }
      return { ok: true, version, records: since(from) }
    },
    async push(request) {
      if (offline) return { ok: false, reason: 'network' }
      beforePush?.()
      if (request.baseVersion < version) {
        return { ok: false, reason: 'stale', version, records: since(request.baseVersion) }
      }
      version += 1
      for (const record of request.records) {
        records.set(`${record.table}:${record.recordId}`, { ...record, version })
      }
      return { ok: true, version }
    },
  }

  return {
    transport,
    stored: () => [...records.values()],
    version: () => version,
    goOffline: () => (offline = true),
    goOnline: () => (offline = false),
    /** Simulate another device winning the race between our pull and our push. */
    interceptNextPush(fn: () => void) {
      beforePush = () => {
        beforePush = undefined
        fn()
      }
    },
    /** Plant a record this vault's key cannot open. */
    plant(record: WireRecord) {
      version += 1
      records.set(`${record.table}:${record.recordId}`, { ...record, version })
    },
  }
}

let dbCounter = 0
let clock = 1_000

interface Device {
  db: AppDatabase
  repo: RepoContext
  deps: SyncDeps
}

function makeDevice(name: string, key: VaultKey, transport: SyncTransport): Device {
  const db = createTestDb(`sync-test-${name}-${dbCounter++}`)
  const now = () => (clock += 10)
  const repo: RepoContext = { db, deviceId: name, now }
  return { db, repo, deps: { db, vault: { id: VAULT_ID, key }, deviceId: name, now, transport } }
}

describe('syncOnce', () => {
  let key: VaultKey
  let server: ReturnType<typeof fakeServer>
  let a: Device
  let b: Device

  beforeEach(async () => {
    key = (await generateVaultKey()).key
    server = fakeServer()
    a = makeDevice('device-a', key, server.transport)
    b = makeDevice('device-b', key, server.transport)
  })

  describe('pushing', () => {
    it('uploads a record the server has never seen', async () => {
      await propertyRepo.save(a.repo, { label: 'Hauptstraße 5', postalCode: '10115' })

      const outcome = await syncOnce(a.deps)

      expect(outcome).toMatchObject({ kind: 'synced', pushed: 1 })
      expect(server.stored()).toHaveLength(1)
    })

    it('uploads nothing the second time around', async () => {
      await propertyRepo.save(a.repo, { label: 'Hauptstraße 5', postalCode: '10115' })
      await syncOnce(a.deps)

      const outcome = await syncOnce(a.deps)

      expect(outcome).toMatchObject({ kind: 'synced', pushed: 0 })
      expect(server.version()).toBe(1)
    })

    it('uploads an edit made after the first sync', async () => {
      const saved = await propertyRepo.save(a.repo, { label: 'Alt', postalCode: '10115' })
      await syncOnce(a.deps)

      await propertyRepo.save(a.repo, { id: saved.id, label: 'Neu', postalCode: '10115' })
      const outcome = await syncOnce(a.deps)

      expect(outcome).toMatchObject({ pushed: 1 })
    })

    it('keeps the record body away from the server', async () => {
      await propertyRepo.save(a.repo, { label: 'Hauptstraße 5', postalCode: '10115' })

      await syncOnce(a.deps)

      expect(JSON.stringify(server.stored())).not.toContain('Hauptstraße')
      expect(JSON.stringify(server.stored())).not.toContain('10115')
    })
  })

  describe('pulling', () => {
    it('delivers a record to the other device', async () => {
      await propertyRepo.save(a.repo, { label: 'Hauptstraße 5', postalCode: '10115' })
      await syncOnce(a.deps)

      await syncOnce(b.deps)

      const [property] = await propertyRepo.all(b.repo)
      expect(property).toMatchObject({ label: 'Hauptstraße 5', postalCode: '10115' })
    })

    it('does not echo a record straight back to the server', async () => {
      await propertyRepo.save(a.repo, { label: 'Hauptstraße 5', postalCode: '10115' })
      await syncOnce(a.deps)

      await syncOnce(b.deps)
      const outcome = await syncOnce(b.deps)

      expect(outcome).toMatchObject({ pushed: 0 })
      expect(server.version()).toBe(1)
    })

    it('carries a delete across', async () => {
      const property = await propertyRepo.save(a.repo, { label: 'Weg', postalCode: '10115' })
      await syncOnce(a.deps)
      await syncOnce(b.deps)

      await propertyRepo.remove(a.repo, property.id)
      await syncOnce(a.deps)
      await syncOnce(b.deps)

      expect(await propertyRepo.all(b.repo)).toEqual([])
    })

    it('carries records of every kind, not just properties', async () => {
      const property = await propertyRepo.save(a.repo, { label: 'Haus', postalCode: '10115' })
      const meter = await meterRepo.save(a.repo, {
        propertyId: property.id,
        label: 'Strom',
        kind: 'electricity',
      })
      await readingRepo.save(a.repo, { meterId: meter.id, date: '2026-01-01', value: '1234.5' })
      await syncOnce(a.deps)

      await syncOnce(b.deps)

      expect(await meterRepo.byProperty(b.repo, property.id)).toHaveLength(1)
      expect(await readingRepo.byMeter(b.repo, meter.id)).toHaveLength(1)
    })

    it('leaves an envelope it cannot open alone', async () => {
      await propertyRepo.save(a.repo, { label: 'Echt', postalCode: '10115' })
      await syncOnce(a.deps)
      await syncOnce(b.deps)
      server.plant({
        table: 'properties',
        recordId: 'corrupted',
        envelope: { iv: 'AAECAwQFBgcICQoL', ct: 'bm90IG91ciBjaXBoZXJ0ZXh0' },
      })

      const outcome = await syncOnce(b.deps)

      expect(outcome.kind).toBe('synced')
      expect(await propertyRepo.all(b.repo)).toHaveLength(1)
    })
  })

  describe('when the network is down', () => {
    it('reports itself offline', async () => {
      await propertyRepo.save(a.repo, { label: 'Haus', postalCode: '10115' })
      server.goOffline()

      expect(await syncOnce(a.deps)).toEqual({ kind: 'offline' })
    })

    it('keeps local data untouched', async () => {
      await propertyRepo.save(a.repo, { label: 'Haus', postalCode: '10115' })
      server.goOffline()

      await syncOnce(a.deps)

      expect(await propertyRepo.all(a.repo)).toHaveLength(1)
    })

    it('sends everything once the network is back', async () => {
      await propertyRepo.save(a.repo, { label: 'Haus', postalCode: '10115' })
      server.goOffline()
      await syncOnce(a.deps)

      server.goOnline()
      const outcome = await syncOnce(a.deps)

      expect(outcome).toMatchObject({ pushed: 1 })
    })
  })

  describe('when another device pushed first', () => {
    it('takes the rejection, merges, and lands the push next round', async () => {
      await propertyRepo.save(a.repo, { label: 'Meins', postalCode: '10115' })
      // Device B slips a record in between our pull and our push.
      server.interceptNextPush(() => {
        server.plant({
          table: 'meters',
          recordId: 'from-elsewhere',
          envelope: { iv: 'AAECAwQFBgcICQoL', ct: 'bm90IG91ciBjaXBoZXJ0ZXh0' },
        })
      })

      const first = await syncOnce(a.deps)
      const second = await syncOnce(a.deps)

      expect(first).toMatchObject({ kind: 'synced', pushed: 0 })
      expect(second).toMatchObject({ pushed: 1 })
    })
  })

  describe('conflicts', () => {
    async function divergeOnLabel(): Promise<string> {
      const property = await propertyRepo.save(a.repo, { label: 'Original', postalCode: '10115' })
      await syncOnce(a.deps)
      await syncOnce(b.deps)

      await propertyRepo.save(a.repo, { id: property.id, label: 'A sagt', postalCode: '10115' })
      await propertyRepo.save(b.repo, { id: property.id, label: 'B sagt', postalCode: '10115' })
      await syncOnce(a.deps)
      await syncOnce(b.deps)
      return property.id
    }

    it('queues a conflict rather than picking a winner', async () => {
      await divergeOnLabel()

      const conflicts = await listConflicts(b.db)

      expect(conflicts).toHaveLength(1)
      expect(labelOf(conflicts[0].local)).toBe('B sagt')
      expect(labelOf(conflicts[0].remote)).toBe('A sagt')
    })

    it('leaves the local value in place until the user decides', async () => {
      const id = await divergeOnLabel()

      const property = await propertyRepo.get(b.repo, id)

      expect(property?.label).toBe('B sagt')
    })

    it('reports the conflict count in the outcome', async () => {
      const property = await propertyRepo.save(a.repo, { label: 'Original', postalCode: '10115' })
      await syncOnce(a.deps)
      await syncOnce(b.deps)
      await propertyRepo.save(a.repo, { id: property.id, label: 'A sagt', postalCode: '10115' })
      await propertyRepo.save(b.repo, { id: property.id, label: 'B sagt', postalCode: '10115' })
      await syncOnce(a.deps)

      expect(await syncOnce(b.deps)).toMatchObject({ conflicts: 1 })
    })

    it('does not queue the same conflict twice', async () => {
      await divergeOnLabel()

      await syncOnce(b.deps)

      expect(await listConflicts(b.db)).toHaveLength(1)
    })

    it('applies the remote side when the user picks it', async () => {
      const id = await divergeOnLabel()
      const [conflict] = await listConflicts(b.db)

      await resolveConflictById(b.deps, conflict.id, 'remote')

      expect((await propertyRepo.get(b.repo, id))?.label).toBe('A sagt')
      expect(await listConflicts(b.db)).toEqual([])
    })

    it('keeps the local side when the user picks it', async () => {
      const id = await divergeOnLabel()
      const [conflict] = await listConflicts(b.db)

      await resolveConflictById(b.deps, conflict.id, 'local')

      expect((await propertyRepo.get(b.repo, id))?.label).toBe('B sagt')
    })

    it('settles the argument on the other device too', async () => {
      const id = await divergeOnLabel()
      const [conflict] = await listConflicts(b.db)
      await resolveConflictById(b.deps, conflict.id, 'local')

      await syncOnce(b.deps)
      await syncOnce(a.deps)

      expect((await propertyRepo.get(a.repo, id))?.label).toBe('B sagt')
      expect(await listConflicts(a.db)).toEqual([])
    })
  })

  describe('two devices, many rounds', () => {
    it('converges on the same dataset', async () => {
      await propertyRepo.save(a.repo, { label: 'Von A', postalCode: '10115' })
      await propertyRepo.save(b.repo, { label: 'Von B', postalCode: '20095' })

      await syncOnce(a.deps)
      await syncOnce(b.deps)
      await syncOnce(b.deps)
      await syncOnce(a.deps)

      const onA = (await propertyRepo.all(a.repo)).map((p) => p.label).sort()
      const onB = (await propertyRepo.all(b.repo)).map((p) => p.label).sort()
      expect(onA).toEqual(['Von A', 'Von B'])
      expect(onB).toEqual(onA)
    })

    it('goes quiet once both devices agree', async () => {
      await propertyRepo.save(a.repo, { label: 'Von A', postalCode: '10115' })
      await propertyRepo.save(b.repo, { label: 'Von B', postalCode: '20095' })
      for (const device of [a, b, b, a, a, b]) await syncOnce(device.deps)

      const settled = server.version()
      await syncOnce(a.deps)
      await syncOnce(b.deps)

      expect(server.version()).toBe(settled)
    })
  })
})

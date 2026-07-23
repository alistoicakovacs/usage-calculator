import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type AppDatabase } from './db'
import {
  meterRepo,
  propertyRepo,
  readingRepo,
  tariffRepo,
  type RepoContext,
} from './repos'

let db: AppDatabase
let ctx: RepoContext
let clock: number

beforeEach(async () => {
  db = createTestDb(`test-${crypto.randomUUID()}`)
  clock = 1000
  ctx = { db, deviceId: 'device-a', now: () => ++clock }
})

describe('propertyRepo', () => {
  it('saves and lists properties with sync metadata', async () => {
    const p = await propertyRepo.save(ctx, { label: 'Haus', postalCode: '99974' })
    expect(p.id).toBeTruthy()
    expect(p.versionVector['device-a']).toBe(1)
    expect(p.postalCode).toBe('99974')

    const all = await propertyRepo.all(ctx)
    expect(all).toHaveLength(1)
  })

  it('increments version vector on update', async () => {
    const p = await propertyRepo.save(ctx, { label: 'Haus', postalCode: '99974' })
    const p2 = await propertyRepo.save(ctx, { id: p.id, label: 'Haus 2', postalCode: '99974' })
    expect(p2.versionVector['device-a']).toBe(2)
    expect(p2.updatedAt).toBeGreaterThan(p.updatedAt)
  })

  it('remove is a tombstone, not a hard delete', async () => {
    const p = await propertyRepo.save(ctx, { label: 'Haus', postalCode: '99974' })
    await propertyRepo.remove(ctx, p.id)
    expect(await propertyRepo.all(ctx)).toHaveLength(0)
    const raw = await db.properties.get(p.id)
    expect(raw?.deleted).toBe(true)
    expect(raw?.versionVector['device-a']).toBe(2)
  })

  it('cascades removal to meters and their data', async () => {
    const p = await propertyRepo.save(ctx, { label: 'Haus', postalCode: '99974' })
    const m = await meterRepo.save(ctx, { propertyId: p.id, label: 'Strom', kind: 'electricity' })
    await readingRepo.save(ctx, { meterId: m.id, date: '2026-01-01', value: '100' })
    await propertyRepo.remove(ctx, p.id)
    expect(await meterRepo.byProperty(ctx, p.id)).toHaveLength(0)
    expect(await readingRepo.byMeter(ctx, m.id)).toHaveLength(0)
    // tombstones retained for sync
    expect((await db.readings.toArray())[0].deleted).toBe(true)
  })
})

describe('readingRepo', () => {
  it('returns readings sorted by date', async () => {
    const m = 'meter-1'
    await readingRepo.save(ctx, { meterId: m, date: '2026-03-01', value: '300' })
    await readingRepo.save(ctx, { meterId: m, date: '2026-01-01', value: '100' })
    await readingRepo.save(ctx, { meterId: m, date: '2026-02-01', value: '200' })
    const rows = await readingRepo.byMeter(ctx, m)
    expect(rows.map((r) => r.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('preserves decimal strings exactly', async () => {
    await readingRepo.save(ctx, { meterId: 'm', date: '2026-01-01', value: '1234.567' })
    const rows = await readingRepo.byMeter(ctx, 'm')
    expect(rows[0].value).toBe('1234.567')
  })
})

describe('tariffRepo', () => {
  it('sorts by effectiveFrom', async () => {
    await tariffRepo.save(ctx, {
      meterId: 'm',
      effectiveFrom: '2026-01-01',
      unitPrice: '0.35',
      basePricePerYear: '120',
    })
    await tariffRepo.save(ctx, {
      meterId: 'm',
      effectiveFrom: '2025-01-01',
      unitPrice: '0.30',
      basePricePerYear: '100',
    })
    const rows = await tariffRepo.byMeter(ctx, 'm')
    expect(rows.map((t) => t.effectiveFrom)).toEqual(['2025-01-01', '2026-01-01'])
  })
})

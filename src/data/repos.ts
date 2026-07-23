// Repository layer: the only module allowed to touch Dexie tables directly.
// Handles ids, sync metadata stamping, and tombstone deletes.
import type {
  AppDatabase,
  BillingPeriodRow,
  GasConversionRow,
  MeterRow,
  PropertyRow,
  ReadingRow,
  SyncMeta,
  TariffRow,
} from './db'

export interface RepoContext {
  db: AppDatabase
  deviceId: string
  now: () => number
}

function nextMeta(ctx: RepoContext, prev?: SyncMeta): SyncMeta {
  const vector = { ...(prev?.versionVector ?? {}) }
  vector[ctx.deviceId] = (vector[ctx.deviceId] ?? 0) + 1
  return { updatedAt: ctx.now(), deviceId: ctx.deviceId, versionVector: vector }
}

export function newId(): string {
  return crypto.randomUUID()
}

type Draft<T> = Omit<T, keyof SyncMeta | 'id'> & { id?: string }

/** Minimal structural view of a Dexie table used by the generic helpers. */
interface TableLike<T> {
  get(id: string): Promise<T | undefined>
  put(row: T): Promise<unknown>
}

function asTable<T>(table: unknown): TableLike<T> {
  return table as TableLike<T>
}

async function upsert<T extends SyncMeta & { id: string }>(
  ctx: RepoContext,
  tableRef: unknown,
  draft: Draft<T>,
): Promise<T> {
  const table = asTable<T>(tableRef)
  const id = draft.id ?? newId()
  const prev = await table.get(id)
  const row = { ...draft, id, ...nextMeta(ctx, prev) } as unknown as T
  await table.put(row)
  return row
}

async function tombstone<T extends SyncMeta & { id: string }>(
  ctx: RepoContext,
  tableRef: unknown,
  id: string,
): Promise<void> {
  const table = asTable<T>(tableRef)
  const prev = await table.get(id)
  if (!prev) return
  await table.put({ ...prev, ...nextMeta(ctx, prev), deleted: true })
}

const alive = <T extends SyncMeta>(rows: T[]): T[] => rows.filter((r) => !r.deleted)

// ---- Properties ----

export const propertyRepo = {
  async all(ctx: RepoContext): Promise<PropertyRow[]> {
    return alive(await ctx.db.properties.toArray())
  },
  async get(ctx: RepoContext, id: string): Promise<PropertyRow | undefined> {
    const row = await ctx.db.properties.get(id)
    return row && !row.deleted ? row : undefined
  },
  async save(ctx: RepoContext, draft: Draft<PropertyRow>): Promise<PropertyRow> {
    return upsert(ctx, ctx.db.properties, draft)
  },
  async remove(ctx: RepoContext, id: string): Promise<void> {
    // Cascade: tombstone meters (and their data) under this property.
    const meters = alive(await ctx.db.meters.where('propertyId').equals(id).toArray())
    for (const m of meters) await meterRepo.remove(ctx, m.id)
    await tombstone(ctx, ctx.db.properties, id)
  },
}

// ---- Meters ----

export const meterRepo = {
  async byProperty(ctx: RepoContext, propertyId: string): Promise<MeterRow[]> {
    return alive(await ctx.db.meters.where('propertyId').equals(propertyId).toArray())
  },
  async all(ctx: RepoContext): Promise<MeterRow[]> {
    return alive(await ctx.db.meters.toArray())
  },
  async get(ctx: RepoContext, id: string): Promise<MeterRow | undefined> {
    const row = await ctx.db.meters.get(id)
    return row && !row.deleted ? row : undefined
  },
  async save(ctx: RepoContext, draft: Draft<MeterRow>): Promise<MeterRow> {
    return upsert(ctx, ctx.db.meters, draft)
  },
  async remove(ctx: RepoContext, id: string): Promise<void> {
    for (const table of ['readings', 'tariffs', 'gasConversions', 'billingPeriods'] as const) {
      const rows = (await ctx.db[table].where('meterId').equals(id).toArray()) as (SyncMeta & {
        id: string
      })[]
      for (const r of rows.filter((x) => !x.deleted)) await tombstone(ctx, ctx.db[table], r.id)
    }
    await tombstone(ctx, ctx.db.meters, id)
  },
}

// ---- Readings ----

export const readingRepo = {
  async byMeter(ctx: RepoContext, meterId: string): Promise<ReadingRow[]> {
    const rows = alive(await ctx.db.readings.where('meterId').equals(meterId).toArray())
    return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  },
  async save(ctx: RepoContext, draft: Draft<ReadingRow>): Promise<ReadingRow> {
    return upsert(ctx, ctx.db.readings, draft)
  },
  async remove(ctx: RepoContext, id: string): Promise<void> {
    await tombstone(ctx, ctx.db.readings, id)
  },
}

// ---- Tariffs ----

export const tariffRepo = {
  async byMeter(ctx: RepoContext, meterId: string): Promise<TariffRow[]> {
    const rows = alive(await ctx.db.tariffs.where('meterId').equals(meterId).toArray())
    return rows.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
  },
  async save(ctx: RepoContext, draft: Draft<TariffRow>): Promise<TariffRow> {
    return upsert(ctx, ctx.db.tariffs, draft)
  },
  async remove(ctx: RepoContext, id: string): Promise<void> {
    await tombstone(ctx, ctx.db.tariffs, id)
  },
}

// ---- Gas conversions ----

export const gasConversionRepo = {
  async byMeter(ctx: RepoContext, meterId: string): Promise<GasConversionRow[]> {
    const rows = alive(await ctx.db.gasConversions.where('meterId').equals(meterId).toArray())
    return rows.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
  },
  async save(ctx: RepoContext, draft: Draft<GasConversionRow>): Promise<GasConversionRow> {
    return upsert(ctx, ctx.db.gasConversions, draft)
  },
  async remove(ctx: RepoContext, id: string): Promise<void> {
    await tombstone(ctx, ctx.db.gasConversions, id)
  },
}

// ---- Billing periods ----

export const billingPeriodRepo = {
  async byMeter(ctx: RepoContext, meterId: string): Promise<BillingPeriodRow[]> {
    const rows = alive(await ctx.db.billingPeriods.where('meterId').equals(meterId).toArray())
    return rows.sort((a, b) => (a.start < b.start ? -1 : 1))
  },
  async save(ctx: RepoContext, draft: Draft<BillingPeriodRow>): Promise<BillingPeriodRow> {
    return upsert(ctx, ctx.db.billingPeriods, draft)
  },
  async remove(ctx: RepoContext, id: string): Promise<void> {
    await tombstone(ctx, ctx.db.billingPeriods, id)
  },
}

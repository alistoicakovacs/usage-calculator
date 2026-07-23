// Dexie database schema. Every syncable record carries sync metadata so
// Phase 4 can merge with version vectors without a schema migration.
import Dexie, { type EntityTable } from 'dexie'
import type { DecimalString } from '../domain/decimal'
import type { LocalDate } from '../domain/dates'
import type { MeterKind } from '../domain/types'

/** Sync metadata carried by every replicated record. */
export interface SyncMeta {
  /** Milliseconds since epoch of last local modification. */
  updatedAt: number
  /** Device that made the last modification. */
  deviceId: string
  /** Per-device logical clock: { [deviceId]: counter }. */
  versionVector: Record<string, number>
  /** Tombstone. Deleted records are retained for sync. */
  deleted?: boolean
}

export interface PropertyRow extends SyncMeta {
  id: string
  label: string
  /** Five-character German postal code, leading zeros preserved. */
  postalCode: string
}

export interface MeterRow extends SyncMeta {
  id: string
  propertyId: string
  label: string
  kind: MeterKind
  /** Meter serial number (optional, from the physical meter). */
  serial?: string
}

export interface ReadingRow extends SyncMeta {
  id: string
  meterId: string
  date: LocalDate
  value: DecimalString
  isBaseline?: boolean
  /** Set when the user resolved a decrease: how it was resolved. */
  decreaseResolution?: 'correction' | 'rollover' | 'replacement'
}

export interface TariffRow extends SyncMeta {
  id: string
  meterId: string
  effectiveFrom: LocalDate
  unitPrice: DecimalString
  basePricePerYear: DecimalString
}

export interface GasConversionRow extends SyncMeta {
  id: string
  meterId: string
  effectiveFrom: LocalDate
  brennwert: DecimalString
  zustandszahl: DecimalString
}

export interface BillingPeriodRow extends SyncMeta {
  id: string
  meterId: string
  start: LocalDate
  end: LocalDate
  monthlyAdvance: DecimalString
}

/** Local-only app state (device id, vault metadata). Not synchronized. */
export interface LocalStateRow {
  key: string
  value: string
}

export class AppDatabase extends Dexie {
  properties!: EntityTable<PropertyRow, 'id'>
  meters!: EntityTable<MeterRow, 'id'>
  readings!: EntityTable<ReadingRow, 'id'>
  tariffs!: EntityTable<TariffRow, 'id'>
  gasConversions!: EntityTable<GasConversionRow, 'id'>
  billingPeriods!: EntityTable<BillingPeriodRow, 'id'>
  localState!: EntityTable<LocalStateRow, 'key'>

  constructor(name = 'usage-calculator') {
    super(name)
    this.version(1).stores({
      properties: 'id, updatedAt',
      meters: 'id, propertyId, updatedAt',
      readings: 'id, meterId, [meterId+date], updatedAt',
      tariffs: 'id, meterId, updatedAt',
      gasConversions: 'id, meterId, updatedAt',
      billingPeriods: 'id, meterId, updatedAt',
      localState: 'key',
    })
  }
}

let instance: AppDatabase | undefined

export function getDb(): AppDatabase {
  instance ??= new AppDatabase()
  return instance
}

/** Test helper: fresh isolated database. */
export function createTestDb(name: string): AppDatabase {
  return new AppDatabase(name)
}

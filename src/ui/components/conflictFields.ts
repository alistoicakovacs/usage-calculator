// Turns two versions of a record into something a person can choose between.
//
// The chooser has to work without the user knowing what a version vector is,
// so it shows plain German field names, formats values the way the rest of the
// app does, and states a deletion in words instead of showing blank fields.
import { dec } from '../../domain/decimal'
import { formatDateDe } from '../../domain/dates'
import { formatGermanDecimal } from '../../domain/parse'
import type { MeterKind } from '../../domain/types'
import type { SyncRow, SyncTable } from '../../sync/protocol'
import { meterKindLabel } from './meters'

export interface ConflictField {
  label: string
  local: string
  remote: string
  differs: boolean
}

const EMPTY = '—'

type FieldKind = 'text' | 'date' | 'decimal' | 'money' | 'meterKind'

interface FieldSpec {
  key: string
  label: string
  kind: FieldKind
}

const FIELDS: Record<SyncTable, FieldSpec[]> = {
  properties: [
    { key: 'label', label: 'Bezeichnung', kind: 'text' },
    { key: 'postalCode', label: 'PLZ', kind: 'text' },
  ],
  meters: [
    { key: 'label', label: 'Bezeichnung', kind: 'text' },
    { key: 'kind', label: 'Art', kind: 'meterKind' },
    { key: 'serial', label: 'Zählernummer', kind: 'text' },
  ],
  readings: [
    { key: 'date', label: 'Datum', kind: 'date' },
    { key: 'value', label: 'Zählerstand', kind: 'decimal' },
  ],
  tariffs: [
    { key: 'effectiveFrom', label: 'Gültig ab', kind: 'date' },
    { key: 'unitPrice', label: 'Arbeitspreis', kind: 'money' },
    { key: 'basePricePerYear', label: 'Grundpreis pro Jahr', kind: 'money' },
  ],
  gasConversions: [
    { key: 'effectiveFrom', label: 'Gültig ab', kind: 'date' },
    { key: 'brennwert', label: 'Brennwert', kind: 'decimal' },
    { key: 'zustandszahl', label: 'Zustandszahl', kind: 'decimal' },
  ],
  billingPeriods: [
    { key: 'start', label: 'Beginn', kind: 'date' },
    { key: 'end', label: 'Ende', kind: 'date' },
    { key: 'monthlyAdvance', label: 'Abschlag pro Monat', kind: 'money' },
  ],
}

const SUBJECTS: Record<SyncTable, string> = {
  properties: 'Immobilie',
  meters: 'Zähler',
  readings: 'Zählerstand',
  tariffs: 'Tarif',
  gasConversions: 'Gas-Umrechnung',
  billingPeriods: 'Abrechnungszeitraum',
}

export function conflictSubject(table: SyncTable): string {
  return SUBJECTS[table]
}

export function describeConflict(
  table: SyncTable,
  local: SyncRow,
  remote: SyncRow,
): ConflictField[] {
  const fields: ConflictField[] = []

  // A tombstone carries no values, so lead with the fact of the deletion —
  // otherwise one column just looks blank.
  if (local.deleted || remote.deleted) {
    fields.push({
      label: 'Status',
      local: local.deleted ? 'Gelöscht' : 'Vorhanden',
      remote: remote.deleted ? 'Gelöscht' : 'Vorhanden',
      differs: Boolean(local.deleted) !== Boolean(remote.deleted),
    })
  }

  for (const spec of FIELDS[table]) {
    const localText = format(spec.kind, (local as unknown as Record<string, unknown>)[spec.key])
    const remoteText = format(spec.kind, (remote as unknown as Record<string, unknown>)[spec.key])
    fields.push({
      label: spec.label,
      local: localText,
      remote: remoteText,
      differs: localText !== remoteText,
    })
  }

  return fields
}

function format(kind: FieldKind, value: unknown): string {
  if (value === undefined || value === null || value === '') return EMPTY

  switch (kind) {
    case 'date':
      return formatDateDe(String(value))
    case 'decimal':
      return formatGermanDecimal(dec(String(value)))
    case 'money':
      return `${formatGermanDecimal(dec(String(value)), 2)} €`
    case 'meterKind':
      return meterKindLabel(value as MeterKind)
    case 'text':
      return String(value)
  }
}

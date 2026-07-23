import { describe, expect, it } from 'vitest'
import type { SyncRow } from '../../sync/protocol'
import { conflictSubject, describeConflict } from './conflictFields'

const META = { updatedAt: 1_700_000_000_000, deviceId: 'device-a', versionVector: {} }

const row = (fields: Record<string, unknown>): SyncRow =>
  ({ id: 'r1', ...META, ...fields }) as unknown as SyncRow

describe('describeConflict', () => {
  it('puts the two sides of a changed field next to each other', () => {
    const fields = describeConflict(
      'properties',
      row({ label: 'Hauptstraße 5', postalCode: '10115' }),
      row({ label: 'Hauptstr. 5', postalCode: '10115' }),
    )

    expect(fields).toContainEqual({
      label: 'Bezeichnung',
      local: 'Hauptstraße 5',
      remote: 'Hauptstr. 5',
      differs: true,
    })
  })

  it('marks fields both devices agree on', () => {
    const fields = describeConflict(
      'properties',
      row({ label: 'A', postalCode: '10115' }),
      row({ label: 'B', postalCode: '10115' }),
    )

    expect(fields.find((f) => f.label === 'PLZ')?.differs).toBe(false)
  })

  it('writes dates the German way', () => {
    const fields = describeConflict(
      'readings',
      row({ date: '2026-03-07', value: '100' }),
      row({ date: '2026-03-08', value: '100' }),
    )

    expect(fields.find((f) => f.label === 'Datum')).toMatchObject({
      local: '07.03.2026',
      remote: '08.03.2026',
    })
  })

  it('writes numbers the German way', () => {
    const fields = describeConflict(
      'readings',
      row({ date: '2026-03-07', value: '1234.5' }),
      row({ date: '2026-03-07', value: '1234.6' }),
    )

    expect(fields.find((f) => f.label === 'Zählerstand')).toMatchObject({
      local: '1.234,5',
      remote: '1.234,6',
    })
  })

  it('names the meter kind rather than showing its code', () => {
    const fields = describeConflict(
      'meters',
      row({ label: 'M', kind: 'electricity' }),
      row({ label: 'M', kind: 'gas' }),
    )

    expect(fields.find((f) => f.label === 'Art')).toMatchObject({
      local: 'Strom',
      remote: 'Gas',
    })
  })

  it('spells out a deletion so it is not mistaken for an empty field', () => {
    const fields = describeConflict(
      'properties',
      row({ label: 'Haus', postalCode: '10115' }),
      row({ deleted: true }),
    )

    expect(fields[0]).toEqual({
      label: 'Status',
      local: 'Vorhanden',
      remote: 'Gelöscht',
      differs: true,
    })
  })

  it('leaves the status row out when neither side deleted anything', () => {
    const fields = describeConflict(
      'properties',
      row({ label: 'A', postalCode: '10115' }),
      row({ label: 'B', postalCode: '10115' }),
    )

    expect(fields.some((f) => f.label === 'Status')).toBe(false)
  })

  it('shows an unset optional field as a dash rather than "undefined"', () => {
    const fields = describeConflict(
      'meters',
      row({ label: 'M', kind: 'electricity', serial: '12345' }),
      row({ label: 'M', kind: 'electricity' }),
    )

    expect(fields.find((f) => f.label === 'Zählernummer')?.remote).toBe('—')
  })
})

describe('conflictSubject', () => {
  it('names what kind of thing is in dispute', () => {
    expect(conflictSubject('readings')).toBe('Zählerstand')
    expect(conflictSubject('properties')).toBe('Immobilie')
  })
})

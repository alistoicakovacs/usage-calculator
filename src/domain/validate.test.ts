import { describe, expect, it } from 'vitest'
import { validatePostalCode, validateReading } from './validate'
import type { Reading } from './types'

const existing: Reading[] = [
  { id: 'r1', meterId: 'm1', date: '2026-01-01', value: '1000' },
  { id: 'r2', meterId: 'm1', date: '2026-02-01', value: '1100' },
]

describe('validateReading', () => {
  it('accepts a valid new reading', () => {
    const res = validateReading({ date: '2026-03-01', value: '1.234,5' }, existing)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.value).toBe('1234.5')
      expect(res.value.warning).toBeUndefined()
    }
  })

  it('rejects invalid dates', () => {
    const res = validateReading({ date: '2026-02-30', value: '1200' }, existing)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('invalid-date')
  })

  it('rejects malformed values', () => {
    const res = validateReading({ date: '2026-03-01', value: '12.34' }, existing)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('invalid-value')
  })

  it('rejects duplicate same-date readings', () => {
    const res = validateReading({ date: '2026-02-01', value: '1150' }, existing)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.kind).toBe('duplicate-date')
      if (res.error.kind === 'duplicate-date') {
        expect(res.error.existingReadingId).toBe('r2')
      }
    }
  })

  it('allows same-date when correcting that exact reading', () => {
    const res = validateReading(
      { date: '2026-02-01', value: '1150', editingReadingId: 'r2' },
      existing,
    )
    expect(res.ok).toBe(true)
  })

  it('warns on decreasing value with explicit choices', () => {
    const res = validateReading({ date: '2026-03-01', value: '900' }, existing)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.warning?.kind).toBe('decrease')
      expect(res.value.warning?.previousReadingId).toBe('r2')
      expect(res.value.warning?.choices).toEqual(['correction', 'rollover', 'replacement'])
    }
  })

  it('compares against the closest earlier reading when inserting between', () => {
    // Inserting Jan 15 with value below Jan 1's reading warns against r1, not r2.
    const res = validateReading({ date: '2026-01-15', value: '990' }, existing)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.warning?.previousReadingId).toBe('r1')
  })

  it('does not warn when editing removes the compared reading', () => {
    const res = validateReading(
      { date: '2026-02-15', value: '1050', editingReadingId: 'r2' },
      existing,
    )
    // compares against r1 (1000) since r2 is being edited: 1050 > 1000, no warning
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.warning).toBeUndefined()
  })
})

describe('validatePostalCode', () => {
  it('accepts five-digit codes and preserves leading zeros', () => {
    const res = validatePostalCode('01067')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toBe('01067')
    expect(validatePostalCode('99974').ok).toBe(true)
  })

  it('rejects wrong lengths and non-digits', () => {
    expect(validatePostalCode('9997').ok).toBe(false)
    expect(validatePostalCode('999741').ok).toBe(false)
    expect(validatePostalCode('99a74').ok).toBe(false)
    expect(validatePostalCode('').ok).toBe(false)
  })

  it('trims whitespace', () => {
    expect(validatePostalCode(' 99974 ').ok).toBe(true)
  })
})

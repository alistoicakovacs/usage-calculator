import { describe, expect, it } from 'vitest'
import { dec } from './decimal'
import { conversionAt, conversionFactor, gasToKwh } from './gas'
import type { GasConversion } from './types'

const conv = (id: string, from: string, brennwert: string, zustandszahl: string): GasConversion => ({
  id,
  meterId: 'm1',
  effectiveFrom: from,
  brennwert,
  zustandszahl,
})

describe('conversionFactor', () => {
  it('multiplies Brennwert × Zustandszahl', () => {
    expect(conversionFactor(conv('c1', '2026-01-01', '11.234', '0.95')).toString()).toBe('10.6723')
  })
})

describe('conversionAt', () => {
  const list = [
    conv('c1', '2025-01-01', '11.0', '0.95'),
    conv('c2', '2026-01-01', '11.5', '0.96'),
  ]

  it('selects the latest effective conversion', () => {
    const r = conversionAt(list, '2026-06-01')
    expect(r.ok && r.value.id).toBe('c2')
  })

  it('selects earlier conversion for earlier dates', () => {
    const r = conversionAt(list, '2025-06-01')
    expect(r.ok && r.value.id).toBe('c1')
  })

  it('boundary date uses the new conversion', () => {
    const r = conversionAt(list, '2026-01-01')
    expect(r.ok && r.value.id).toBe('c2')
  })

  it('errors when no conversion applies (never bill m³ against kWh tariff)', () => {
    const r = conversionAt(list, '2024-06-01')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('missing-conversion')
  })

  it('errors on empty conversion list', () => {
    const r = conversionAt([], '2026-01-01')
    expect(r.ok).toBe(false)
  })
})

describe('gasToKwh', () => {
  it('converts billing-accurately', () => {
    // 100 m³ × 11.234 × 0.95 = 1067.23 kWh
    const r = gasToKwh(dec('100'), [conv('c1', '2026-01-01', '11.234', '0.95')], '2026-06-01')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.kwh.toString()).toBe('1067.23')
      expect(r.value.conversion.id).toBe('c1')
    }
  })
})

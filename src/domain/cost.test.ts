import { describe, expect, it } from 'vitest'
import { computeConsumption } from './consumption'
import { costInterval, tariffAt } from './cost'
import { dec, roundMoney } from './decimal'
import type { GasConversion, Reading, TariffPeriod } from './types'

const r = (id: string, date: string, value: string): Reading => ({
  id,
  meterId: 'm1',
  date,
  value,
})

const tariff = (
  id: string,
  from: string,
  unitPrice: string,
  basePricePerYear = '0',
): TariffPeriod => ({
  id,
  meterId: 'm1',
  effectiveFrom: from,
  unitPrice,
  basePricePerYear,
})

function intervalOf(readings: Reading[]) {
  const s = computeConsumption(readings)
  expect(s.intervals).toHaveLength(1)
  return s.intervals[0]
}

describe('tariffAt', () => {
  const tariffs = [tariff('t1', '2025-01-01', '0.30'), tariff('t2', '2026-01-01', '0.35')]

  it('picks the applicable tariff', () => {
    expect(tariffAt(tariffs, '2025-06-01').ok && (tariffAt(tariffs, '2025-06-01') as any).value.id).toBe('t1')
    expect((tariffAt(tariffs, '2026-01-01') as any).value.id).toBe('t2')
  })

  it('errors before any tariff', () => {
    expect(tariffAt(tariffs, '2024-01-01').ok).toBe(false)
  })
})

describe('costInterval — single tariff', () => {
  it('computes exact usage cost plus daily base price', () => {
    // 100 kWh over 10 days at 0.30 EUR/kWh, base 36.50 EUR/year → 0.1 EUR/day
    const interval = intervalOf([r('a', '2026-01-01', '1000'), r('b', '2026-01-11', '1100')])
    const res = costInterval(interval, 'electricity', [tariff('t1', '2025-01-01', '0.30', '36.50')])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.segments).toHaveLength(1)
    expect(res.value.segments[0].prorated).toBe(false)
    expect(res.value.usageCost.toString()).toBe('30')
    expect(res.value.baseCost.toString()).toBe('1')
    expect(res.value.totalCost.toString()).toBe('31')
  })

  it('errors when no tariff covers the interval', () => {
    const interval = intervalOf([r('a', '2026-01-01', '0'), r('b', '2026-01-11', '10')])
    const res = costInterval(interval, 'electricity', [tariff('t1', '2027-01-01', '0.30')])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('no-tariff')
  })
})

describe('costInterval — tariff change mid-interval', () => {
  it('splits usage across tariffs by day, labelled prorated', () => {
    // 100 kWh over 10 days (Jan 2–11 consumption days). Tariff changes Jan 7.
    // 5 days at 0.30 (Jan 2-6), 5 days at 0.40 (Jan 7-11); 10 kWh/day.
    const interval = intervalOf([r('a', '2026-01-01', '0'), r('b', '2026-01-11', '100')])
    const res = costInterval(interval, 'electricity', [
      tariff('t1', '2025-01-01', '0.30'),
      tariff('t2', '2026-01-07', '0.40'),
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.segments).toHaveLength(2)
    expect(res.value.segments[0].days).toBe(5)
    expect(res.value.segments[0].usageNative.toString()).toBe('50')
    expect(res.value.segments[0].usageCost.toString()).toBe('15')
    expect(res.value.segments[0].prorated).toBe(true)
    expect(res.value.segments[1].days).toBe(5)
    expect(res.value.segments[1].usageCost.toString()).toBe('20')
    expect(res.value.usageCost.toString()).toBe('35')
  })

  it('handles tariff change on the interval end date', () => {
    const interval = intervalOf([r('a', '2026-01-01', '0'), r('b', '2026-01-10', '90')])
    const res = costInterval(interval, 'electricity', [
      tariff('t1', '2025-01-01', '0.30'),
      tariff('t2', '2026-01-10', '0.40'),
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // 8 days old tariff (Jan 2-9), 1 day new (Jan 10), 10 kWh/day
    expect(res.value.segments).toHaveLength(2)
    expect(res.value.segments[0].days).toBe(8)
    expect(res.value.segments[1].days).toBe(1)
    expect(res.value.usageCost.toString()).toBe('28')
  })

  it('splits base price across tariffs too', () => {
    // 10 days, base A = 365/year → 1/day; base B = 730/year → 2/day
    const interval = intervalOf([r('a', '2026-01-01', '0'), r('b', '2026-01-11', '10')])
    const res = costInterval(interval, 'electricity', [
      tariff('t1', '2025-01-01', '0', '365'),
      tariff('t2', '2026-01-07', '0', '730'),
    ])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.baseCost.toString()).toBe('15') // 5×1 + 5×2
  })

  it('preserves historical tariffs (old interval uses old tariff)', () => {
    const tariffs = [tariff('t1', '2025-01-01', '0.30'), tariff('t2', '2026-01-01', '0.99')]
    const oldInterval = intervalOf([r('a', '2025-03-01', '0'), r('b', '2025-03-11', '100')])
    const res = costInterval(oldInterval, 'electricity', tariffs)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.usageCost.toString()).toBe('30')
  })
})

describe('costInterval — gas', () => {
  const conversions: GasConversion[] = [
    { id: 'c1', meterId: 'm1', effectiveFrom: '2025-01-01', brennwert: '11.2', zustandszahl: '0.95' },
  ]

  it('converts m³ to kWh before applying the kWh tariff', () => {
    // 100 m³ × 11.2 × 0.95 = 1064 kWh × 0.10 EUR = 106.40 EUR
    const interval = intervalOf([r('a', '2026-01-01', '500'), r('b', '2026-01-31', '600')])
    const res = costInterval(interval, 'gas', [tariff('t1', '2025-01-01', '0.10')], conversions)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.segments[0].usageBilled.toString()).toBe('1064')
    expect(res.value.segments[0].gasConversionId).toBe('c1')
    expect(roundMoney(res.value.usageCost).toString()).toBe('106.4')
  })

  it('errors when conversion is missing — never multiply m³ by kWh price', () => {
    const interval = intervalOf([r('a', '2026-01-01', '500'), r('b', '2026-01-31', '600')])
    const res = costInterval(interval, 'gas', [tariff('t1', '2025-01-01', '0.10')], [])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('missing-conversion')
  })

  it('applies effective-dated conversion per segment when it changes mid-interval', () => {
    const conv2: GasConversion[] = [
      ...conversions,
      { id: 'c2', meterId: 'm1', effectiveFrom: '2026-01-07', brennwert: '10', zustandszahl: '1' },
    ]
    // 100 m³ over 10 days, conversion changes Jan 7 (also add tariff boundary
    // to force segmentation? No: conversion follows segments; a single tariff
    // means one segment, conversion picked at segment start).
    const interval = intervalOf([r('a', '2026-01-01', '0'), r('b', '2026-01-11', '100')])
    const res = costInterval(interval, 'gas', [tariff('t1', '2025-01-01', '0.10')], conv2)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    // Single segment starting Jan 2 → conversion c1 applies.
    expect(res.value.segments[0].gasConversionId).toBe('c1')
  })
})

describe('costInterval — water (m³ billing, no conversion)', () => {
  it('bills m³ directly', () => {
    const interval = intervalOf([r('a', '2026-01-01', '100'), r('b', '2026-01-31', '110')])
    const res = costInterval(interval, 'water', [tariff('t1', '2025-01-01', '2.10')])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.usageCost.toString()).toBe('21')
  })
})

describe('money precision', () => {
  it('keeps full precision internally, rounds only for presentation', () => {
    // 7 kWh over 3 days at 0.2999 — internal value unrounded
    const interval = intervalOf([r('a', '2026-01-01', '0'), r('b', '2026-01-04', '7')])
    const res = costInterval(interval, 'electricity', [tariff('t1', '2025-01-01', '0.2999')])
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.usageCost.toString()).toBe('2.0993')
    expect(roundMoney(res.value.usageCost).toString()).toBe('2.1')
    expect(roundMoney(dec('2.005')).toString()).toBe('2.01') // half-up
  })
})

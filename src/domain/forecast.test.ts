import { describe, expect, it } from 'vitest'
import { dec, roundMoney } from './decimal'
import {
  aggregateBalances,
  approximateMonths,
  forecastBillingPeriod,
  isGuthaben,
} from './forecast'
import type { BillingPeriod, Reading, TariffPeriod } from './types'

const r = (id: string, date: string, value: string): Reading => ({
  id,
  meterId: 'm1',
  date,
  value,
})

const tariff = (unitPrice: string, basePricePerYear = '0'): TariffPeriod => ({
  id: 't1',
  meterId: 'm1',
  effectiveFrom: '2025-01-01',
  unitPrice,
  basePricePerYear,
})

const billing = (start: string, end: string, monthlyAdvance: string): BillingPeriod => ({
  id: 'b1',
  meterId: 'm1',
  start,
  end,
  monthlyAdvance,
})

describe('approximateMonths', () => {
  it('whole calendar year is exactly 12', () => {
    expect(approximateMonths('2026-01-01', '2026-12-31').toString()).toBe('12')
  })

  it('non-calendar whole-month period is exact', () => {
    expect(approximateMonths('2025-04-01', '2026-03-31').toString()).toBe('12')
    expect(approximateMonths('2026-04-01', '2026-06-30').toString()).toBe('3')
  })

  it('partial periods approximate by days', () => {
    const m = approximateMonths('2026-01-15', '2026-02-14')
    expect(m.toFixed(3)).toBe('1.019') // 31 days × 12/365
  })
})

describe('forecastBillingPeriod', () => {
  it('projects annual cost and computes Nachzahlung', () => {
    // 3650 kWh/year pace: 10 kWh/day × 0.30 = 3 EUR/day → 1095 EUR/year.
    // Advances: 80 EUR × 12 = 960 → balance = -135 (Nachzahlung)
    const res = forecastBillingPeriod(
      [r('a', '2026-01-01', '0'), r('b', '2026-01-31', '300')],
      'electricity',
      [tariff('0.30')],
      billing('2026-01-01', '2026-12-31', '80'),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const f = res.value
    expect(f.insufficientData).toBe(false)
    expect(f.measuredDays).toBe(30)
    expect(f.accruedCost.toString()).toBe('90')
    expect(f.projectedTotalCost.toString()).toBe('1095')
    expect(f.totalAdvances.toString()).toBe('960')
    expect(f.balance.toString()).toBe('-135')
    expect(isGuthaben(f)).toBe(false)
    expect(f.estimated).toBe(true)
  })

  it('computes Guthaben when advances exceed projection', () => {
    const res = forecastBillingPeriod(
      [r('a', '2026-01-01', '0'), r('b', '2026-01-31', '300')],
      'electricity',
      [tariff('0.30')],
      billing('2026-01-01', '2026-12-31', '100'),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.balance.toString()).toBe('105') // 1200 - 1095
    expect(isGuthaben(res.value)).toBe(true)
  })

  it('handles non-calendar billing years', () => {
    const res = forecastBillingPeriod(
      [r('a', '2025-04-01', '0'), r('b', '2025-05-01', '300')],
      'electricity',
      [tariff('0.30')],
      billing('2025-04-01', '2026-03-31', '80'),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.totalAdvances.toString()).toBe('960')
    expect(res.value.measuredDays).toBe(30)
    // 365-day period at 3 EUR/day
    expect(res.value.projectedTotalCost.toString()).toBe('1095')
  })

  it('clips intervals that extend outside the billing period', () => {
    // Interval Dec 15 → Jan 14 (30 days, 300 kWh), billing starts Jan 1.
    // Only Jan 1–14 (14 days, 140 kWh) counts.
    const res = forecastBillingPeriod(
      [r('a', '2025-12-15', '0'), r('b', '2026-01-14', '300')],
      'electricity',
      [tariff('0.30')],
      billing('2026-01-01', '2026-12-31', '80'),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.measuredDays).toBe(14)
    expect(roundMoney(res.value.accruedCost).toString()).toBe('42') // 140 × 0.30
  })

  it('reports insufficient data without readings in period', () => {
    const res = forecastBillingPeriod(
      [r('a', '2024-01-01', '0'), r('b', '2024-12-31', '3000')],
      'electricity',
      [tariff('0.30')],
      billing('2026-01-01', '2026-12-31', '80'),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.insufficientData).toBe(true)
    expect(res.value.balance.isZero()).toBe(true)
  })

  it('includes base price in accrual and projection', () => {
    // usage 0, base 365 EUR/year → 1 EUR/day
    const res = forecastBillingPeriod(
      [r('a', '2026-01-01', '100'), r('b', '2026-01-31', '100')],
      'electricity',
      [tariff('0.50', '365')],
      billing('2026-01-01', '2026-12-31', '30'),
    )
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.accruedCost.toString()).toBe('30')
    expect(res.value.projectedTotalCost.toString()).toBe('365')
  })

  it('propagates missing gas conversion as error', () => {
    const res = forecastBillingPeriod(
      [r('a', '2026-01-01', '0'), r('b', '2026-01-31', '100')],
      'gas',
      [tariff('0.10')],
      billing('2026-01-01', '2026-12-31', '50'),
      [],
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.kind).toBe('missing-conversion')
  })
})

describe('aggregateBalances', () => {
  it('sums money balances across meters/properties', () => {
    expect(aggregateBalances([dec('105'), dec('-135'), dec('12.5')]).toString()).toBe('-17.5')
  })

  it('empty portfolio aggregates to zero', () => {
    expect(aggregateBalances([]).toString()).toBe('0')
  })
})

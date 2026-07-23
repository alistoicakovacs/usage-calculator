import { describe, expect, it } from 'vitest'
import { computeConsumption } from './consumption'
import { allocateToMonths, mergeMonthAllocations } from './proration'
import type { Reading } from './types'

const r = (id: string, date: string, value: string): Reading => ({
  id,
  meterId: 'm1',
  date,
  value,
})

function intervalOf(readings: Reading[]) {
  const s = computeConsumption(readings)
  expect(s.intervals).toHaveLength(1)
  return s.intervals[0]
}

describe('allocateToMonths', () => {
  it('allocates within a single month', () => {
    const interval = intervalOf([r('a', '2026-03-05', '0'), r('b', '2026-03-15', '10')])
    const allocs = allocateToMonths(interval)
    expect(allocs).toHaveLength(1)
    expect(allocs[0].month).toBe('2026-03')
    expect(allocs[0].days).toBe(10)
    expect(allocs[0].usage.toString()).toBe('10')
    expect(allocs[0].estimated).toBe(true)
  })

  it('splits across month boundary proportionally to days', () => {
    // Jan 25 → Feb 4: consumption days Jan 26..Feb 4 = 6 in Jan, 4 in Feb; 10 kWh over 10 days
    const interval = intervalOf([r('a', '2026-01-25', '0'), r('b', '2026-02-04', '10')])
    const allocs = allocateToMonths(interval)
    expect(allocs).toHaveLength(2)
    expect(allocs[0].month).toBe('2026-01')
    expect(allocs[0].days).toBe(6)
    expect(allocs[0].usage.toString()).toBe('6')
    expect(allocs[1].month).toBe('2026-02')
    expect(allocs[1].days).toBe(4)
    expect(allocs[1].usage.toString()).toBe('4')
  })

  it('spans multiple months and year boundary', () => {
    const interval = intervalOf([r('a', '2025-11-30', '0'), r('b', '2026-02-28', '90')])
    const allocs = allocateToMonths(interval)
    expect(allocs.map((a) => a.month)).toEqual(['2025-12', '2026-01', '2026-02'])
    const totalDays = allocs.reduce((s, a) => s + a.days, 0)
    expect(totalDays).toBe(interval.days)
    // Allocation sums exactly to interval usage
    const totalUsage = allocs.reduce((s, a) => s.plus(a.usage), allocs[0].usage.minus(allocs[0].usage))
    expect(totalUsage.toString()).toBe('90')
  })

  it('empty for zero-day intervals', () => {
    const s = computeConsumption([r('a', '2026-01-05', '0')])
    expect(s.intervals).toHaveLength(0)
  })
})

describe('mergeMonthAllocations', () => {
  it('merges allocations by month across intervals', () => {
    const i1 = intervalOf([r('a', '2026-01-25', '0'), r('b', '2026-02-04', '10')])
    const i2 = intervalOf([r('b', '2026-02-04', '10'), r('c', '2026-02-14', '30')])
    const merged = mergeMonthAllocations([allocateToMonths(i1), allocateToMonths(i2)])
    expect(merged.map((m) => m.month)).toEqual(['2026-01', '2026-02'])
    expect(merged[1].usage.toString()).toBe('24') // 4 + 20
    expect(merged[1].days).toBe(14)
  })
})

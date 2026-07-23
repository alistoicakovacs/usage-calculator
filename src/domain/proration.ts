// Calendar allocation of interval consumption. Values are prorated linearly
// per day and must always be presented as estimates.
import { Decimal } from './decimal'
import {
  addDays,
  compareDates,
  daysBetween,
  minDate,
  startOfNextMonth,
  type LocalDate,
} from './dates'
import type { ConsumptionInterval } from './consumption'

export interface MonthAllocation {
  /** "YYYY-MM" */
  month: string
  days: number
  usage: Decimal
  /** Always true: calendar allocations are estimates by definition. */
  estimated: true
}

/**
 * Allocate an interval's usage to calendar months, linearly per day.
 * Consumption days are from+1 .. to inclusive (matching cost semantics).
 * Returns [] for zero-day intervals.
 */
export function allocateToMonths(interval: ConsumptionInterval): MonthAllocation[] {
  if (interval.days === 0) return []
  const dailyUsage = interval.usage.div(interval.days)
  const allocations: MonthAllocation[] = []

  let cursor = addDays(interval.from, 1)
  while (compareDates(cursor, interval.to) <= 0) {
    const monthEnd = addDays(startOfNextMonth(cursor), -1)
    const segEnd = minDate(monthEnd, interval.to)
    const days = daysBetween(cursor, segEnd) + 1
    allocations.push({
      month: cursor.slice(0, 7),
      days,
      usage: dailyUsage.times(days),
      estimated: true,
    })
    cursor = addDays(segEnd, 1)
  }
  return allocations
}

/** Merge allocations from multiple intervals of the same meter by month. */
export function mergeMonthAllocations(lists: MonthAllocation[][]): MonthAllocation[] {
  const byMonth = new Map<string, MonthAllocation>()
  for (const list of lists) {
    for (const a of list) {
      const existing = byMonth.get(a.month)
      if (existing) {
        byMonth.set(a.month, {
          month: a.month,
          days: existing.days + a.days,
          usage: existing.usage.plus(a.usage),
          estimated: true,
        })
      } else {
        byMonth.set(a.month, a)
      }
    }
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
}

export type { LocalDate }

import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  daysInMonth,
  formatDateDe,
  isValidLocalDate,
  startOfMonth,
  startOfNextMonth,
} from './dates'

describe('isValidLocalDate', () => {
  it('accepts real dates', () => {
    expect(isValidLocalDate('2026-07-23')).toBe(true)
    expect(isValidLocalDate('2024-02-29')).toBe(true) // leap year
    expect(isValidLocalDate('2026-12-31')).toBe(true)
  })

  it('rejects invalid dates', () => {
    expect(isValidLocalDate('2026-02-29')).toBe(false) // not a leap year
    expect(isValidLocalDate('2026-13-01')).toBe(false)
    expect(isValidLocalDate('2026-00-10')).toBe(false)
    expect(isValidLocalDate('2026-04-31')).toBe(false)
    expect(isValidLocalDate('23.07.2026')).toBe(false)
    expect(isValidLocalDate('2026-7-3')).toBe(false)
    expect(isValidLocalDate('')).toBe(false)
  })
})

describe('daysInMonth', () => {
  it('handles leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2000, 2)).toBe(29) // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28) // divisible by 100, not 400
  })
})

describe('daysBetween / addDays', () => {
  it('computes day differences', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30)
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2) // leap
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('adds days across month/year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('is not confused by DST transition dates (pure calendar math)', () => {
    // Europe/Berlin DST switch 2026-03-29; calendar arithmetic must be exact.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('month helpers', () => {
  it('startOfMonth / startOfNextMonth', () => {
    expect(startOfMonth('2026-07-23')).toBe('2026-07-01')
    expect(startOfNextMonth('2026-07-23')).toBe('2026-08-01')
    expect(startOfNextMonth('2026-12-05')).toBe('2027-01-01')
  })
})

describe('formatDateDe', () => {
  it('formats German dates', () => {
    expect(formatDateDe('2026-07-23')).toBe('23.07.2026')
  })
})

// Local calendar dates as ISO strings ("2026-07-23"), no timezones.
// Readings are associated with local calendar dates per the design.

export type LocalDate = string // "YYYY-MM-DD"

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidLocalDate(s: string): boolean {
  const m = DATE_RE.exec(s)
  if (!m) return false
  const [, ys, ms, ds] = m
  const y = Number(ys)
  const mo = Number(ms)
  const d = Number(ds)
  if (mo < 1 || mo > 12) return false
  return d >= 1 && d <= daysInMonth(y, mo)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Days from date a to date b (b - a). Positive when b is after a. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000)
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(toUtcMs(date) + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a < b ? a : b
}

/** First day of the month containing `date`. */
export function startOfMonth(date: LocalDate): LocalDate {
  return date.slice(0, 8) + '01'
}

/** First day of the month after the month containing `date`. */
export function startOfNextMonth(date: LocalDate): LocalDate {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-01`
}

function toUtcMs(date: LocalDate): number {
  return Date.parse(date + 'T00:00:00Z')
}

export function formatDateDe(date: LocalDate): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
}

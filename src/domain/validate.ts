// Validation for new/edited readings and other user inputs.
import { dec } from './decimal'
import { isValidLocalDate, type LocalDate } from './dates'
import { err, ok, type Result } from './result'
import { parseGermanDecimal, type ParseError } from './parse'
import type { Reading } from './types'

export type ReadingValidationError =
  | { kind: 'invalid-date'; input: string }
  | { kind: 'invalid-value'; cause: ParseError }
  | { kind: 'duplicate-date'; date: LocalDate; existingReadingId: string }

export interface DecreaseWarning {
  kind: 'decrease'
  previousReadingId: string
  previousValue: string
  /** The user must explicitly choose how to treat a lower reading. */
  choices: ['correction', 'rollover', 'replacement']
}

export interface ValidatedReading {
  date: LocalDate
  /** Canonical decimal string (dot separator). */
  value: string
  warning?: DecreaseWarning
}

/**
 * Validate a reading being added or edited.
 * - Date must be a real calendar date.
 * - Value must parse as a non-negative German decimal.
 * - A same-date reading is a duplicate unless it edits that exact reading.
 * - A value lower than the closest earlier reading yields a decrease warning
 *   requiring an explicit user choice; it is never accepted silently.
 */
export function validateReading(
  input: { date: string; value: string; editingReadingId?: string },
  existing: Reading[],
): Result<ValidatedReading, ReadingValidationError> {
  if (!isValidLocalDate(input.date)) {
    return err({ kind: 'invalid-date', input: input.date })
  }
  const parsed = parseGermanDecimal(input.value)
  if (!parsed.ok) {
    return err({ kind: 'invalid-value', cause: parsed.error })
  }

  const sameDate = existing.find(
    (r) => r.date === input.date && r.id !== input.editingReadingId,
  )
  if (sameDate) {
    return err({ kind: 'duplicate-date', date: input.date, existingReadingId: sameDate.id })
  }

  const canonical = parsed.value.toString()

  // Closest earlier reading (excluding the one being edited).
  let prev: Reading | undefined
  for (const r of existing) {
    if (r.id === input.editingReadingId) continue
    if (r.date < input.date && (prev === undefined || r.date > prev.date)) {
      prev = r
    }
  }

  let warning: DecreaseWarning | undefined
  if (prev !== undefined && parsed.value.lt(dec(prev.value))) {
    warning = {
      kind: 'decrease',
      previousReadingId: prev.id,
      previousValue: prev.value,
      choices: ['correction', 'rollover', 'replacement'],
    }
  }

  return ok({ date: input.date, value: canonical, warning })
}

export type PostalCodeError = { kind: 'invalid-postal-code'; input: string }

/** German postal codes: exactly five digits, stored as string (leading zeros). */
export function validatePostalCode(input: string): Result<string, PostalCodeError> {
  const s = input.trim()
  if (!/^\d{5}$/.test(s)) return err({ kind: 'invalid-postal-code', input })
  return ok(s)
}

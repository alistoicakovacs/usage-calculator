// German-locale decimal input parsing.
// Accepts: "1234,56", "1.234,56", "1234", "1.234", "0,5", ",5" is rejected.
// Rejects ambiguous or malformed values rather than guessing.
import { dec, Decimal } from './decimal'
import { err, ok, type Result } from './result'

export type ParseError =
  | { kind: 'empty' }
  | { kind: 'malformed'; input: string }
  | { kind: 'negative'; input: string }

/**
 * Parse a German-formatted decimal string into a Decimal.
 *
 * Rules:
 * - Comma is the decimal separator; dot is the thousands separator.
 * - Thousands separators, when present, must group correctly (1.234.567).
 * - A single dot with a 3-digit group ("1.234") is treated as thousands,
 *   which matches German convention.
 * - A dot followed by a non-3-digit group ("1.23") is ambiguous → rejected.
 * - Plain digits with one comma are always accepted ("1234,56").
 * - Whitespace around the input is ignored; internal spaces are rejected.
 */
export function parseGermanDecimal(input: string, opts?: { allowNegative?: boolean }): Result<Decimal, ParseError> {
  const s = input.trim()
  if (s === '') return err({ kind: 'empty' })

  let body = s
  let negative = false
  if (body.startsWith('-')) {
    negative = true
    body = body.slice(1)
  } else if (body.startsWith('+')) {
    body = body.slice(1)
  }
  if (body === '') return err({ kind: 'malformed', input })

  // Split off decimal part at the comma (at most one comma).
  const commaParts = body.split(',')
  if (commaParts.length > 2) return err({ kind: 'malformed', input })
  const [intPart, fracPart] = commaParts

  if (fracPart !== undefined && !/^\d+$/.test(fracPart)) {
    return err({ kind: 'malformed', input })
  }
  if (intPart === '' ) {
    // ",5" or "-,5": require an integer part for clarity.
    return err({ kind: 'malformed', input })
  }

  let intDigits: string
  if (intPart.includes('.')) {
    // Dots must be correct thousands grouping: first group 1-3 digits, rest exactly 3.
    const groups = intPart.split('.')
    if (groups.some((g) => g === '')) return err({ kind: 'malformed', input })
    if (!/^\d{1,3}$/.test(groups[0])) return err({ kind: 'malformed', input })
    for (const g of groups.slice(1)) {
      if (!/^\d{3}$/.test(g)) return err({ kind: 'malformed', input })
    }
    intDigits = groups.join('')
  } else {
    if (!/^\d+$/.test(intPart)) return err({ kind: 'malformed', input })
    intDigits = intPart
  }

  const canonical = fracPart !== undefined ? `${intDigits}.${fracPart}` : intDigits
  const value = dec(negative ? `-${canonical}` : canonical)
  if (value.isNegative() && !value.isZero() && !opts?.allowNegative) {
    return err({ kind: 'negative', input })
  }
  return ok(value)
}

/** Format a Decimal using German conventions, e.g. 1234.56 → "1.234,56". */
export function formatGermanDecimal(value: Decimal, decimalPlaces?: number): string {
  const fixed = decimalPlaces !== undefined ? value.toFixed(decimalPlaces) : value.toString()
  const negative = fixed.startsWith('-')
  const [intPart, fracPart] = (negative ? fixed.slice(1) : fixed).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const body = fracPart !== undefined ? `${grouped},${fracPart}` : grouped
  return negative ? `-${body}` : body
}

/** Format a money Decimal as German EUR, e.g. 1234.5 → "1.234,50 €". */
export function formatEuro(value: Decimal): string {
  return `${formatGermanDecimal(value, 2)} €`
}

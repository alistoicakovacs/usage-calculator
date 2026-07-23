// Billing-accurate gas conversion: usage m³ × Brennwert × Zustandszahl = kWh.
// Conversion values are effective-dated; the factor applicable at the START of
// an interval's consumption is chosen per sub-interval when splitting.
import { dec, Decimal } from './decimal'
import { compareDates, type LocalDate } from './dates'
import { err, ok, type Result } from './result'
import type { GasConversion } from './types'

export type GasConversionError = { kind: 'missing-conversion'; date: LocalDate }

/** Combined conversion factor kWh per m³. */
export function conversionFactor(c: GasConversion): Decimal {
  return dec(c.brennwert).times(dec(c.zustandszahl))
}

/**
 * Find the conversion effective on `date`: the latest conversion whose
 * effectiveFrom <= date. Returns an error when none applies, since gas m³
 * must never be multiplied directly by a kWh tariff.
 */
export function conversionAt(
  conversions: GasConversion[],
  date: LocalDate,
): Result<GasConversion, GasConversionError> {
  let best: GasConversion | undefined
  for (const c of conversions) {
    if (compareDates(c.effectiveFrom, date) <= 0) {
      if (best === undefined || compareDates(c.effectiveFrom, best.effectiveFrom) > 0) {
        best = c
      }
    }
  }
  return best !== undefined ? ok(best) : err({ kind: 'missing-conversion', date })
}

/** Convert gas m³ to billed kWh using the conversion effective on `date`. */
export function gasToKwh(
  usageM3: Decimal,
  conversions: GasConversion[],
  date: LocalDate,
): Result<{ kwh: Decimal; conversion: GasConversion }, GasConversionError> {
  const c = conversionAt(conversions, date)
  if (!c.ok) return c
  return ok({ kwh: usageM3.times(conversionFactor(c.value)), conversion: c.value })
}

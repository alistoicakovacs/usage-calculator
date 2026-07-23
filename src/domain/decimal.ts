// Central Decimal configuration. All measurement and money arithmetic uses
// Decimal; floats never enter domain calculations. Money is rounded only for
// presentation and final bill totals.
import { Decimal } from 'decimal.js'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

export { Decimal }

/** A decimal serialized as a plain string, e.g. "1234.56" (dot separator). */
export type DecimalString = string

export function dec(value: DecimalString | number): Decimal {
  return new Decimal(value)
}

/** Round to euro cents (2 places) for presentation / final totals only. */
export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}

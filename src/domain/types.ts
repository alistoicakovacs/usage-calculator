// Core domain model types shared across calculations.
import type { DecimalString } from './decimal'
import type { LocalDate } from './dates'

export type MeterKind = 'electricity' | 'gas' | 'water'

/** Native measurement unit per meter kind. Never sum across units. */
export type Unit = 'kWh' | 'm3'

export function nativeUnit(kind: MeterKind): Unit {
  return kind === 'electricity' ? 'kWh' : 'm3'
}

/** Unit that costs are billed in. Gas is billed in kWh after conversion. */
export function billingUnit(kind: MeterKind): Unit {
  return kind === 'water' ? 'm3' : 'kWh'
}

export interface Reading {
  id: string
  meterId: string
  date: LocalDate
  /** Cumulative meter register value in the meter's native unit. */
  value: DecimalString
  /**
   * Baseline readings start a new counting sequence: the first ever reading,
   * or the first reading after a meter replacement/reset. A baseline reading
   * does not produce consumption against its predecessor.
   */
  isBaseline?: boolean
}

/** Effective-dated tariff. Applies from `effectiveFrom` until the next tariff. */
export interface TariffPeriod {
  id: string
  meterId: string
  effectiveFrom: LocalDate
  /** Price per billed unit (EUR per kWh or EUR per m3). */
  unitPrice: DecimalString
  /** Base price in EUR per year (time-based, prorated per day). */
  basePricePerYear: DecimalString
}

/** Effective-dated gas conversion values from the bill. */
export interface GasConversion {
  id: string
  meterId: string
  effectiveFrom: LocalDate
  /** Brennwert (calorific value), kWh per m3, e.g. "11.234". */
  brennwert: DecimalString
  /** Zustandszahl (condition number), dimensionless, e.g. "0.95". */
  zustandszahl: DecimalString
}

export interface BillingPeriod {
  id: string
  meterId: string
  start: LocalDate
  /** Inclusive end date of the billing period. */
  end: LocalDate
  /** Monthly advance payment (Abschlag) in EUR. */
  monthlyAdvance: DecimalString
}

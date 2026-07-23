// Billing-period forecast: accrued cost so far plus projected cost for the
// remaining days, compared with advance payments (Abschläge), estimating a
// credit (Guthaben) or additional payment (Nachzahlung).
import { dec, Decimal } from './decimal'
import {
  addDays,
  compareDates,
  daysBetween,
  maxDate,
  minDate,
  type LocalDate,
} from './dates'
import { ok, type Result } from './result'
import { computeConsumption } from './consumption'
import { costInterval, type CostError } from './cost'
import type { BillingPeriod, GasConversion, MeterKind, Reading, TariffPeriod } from './types'

export interface Forecast {
  /** Cost accrued from measured intervals inside the billing period. */
  accruedCost: Decimal
  /** Days of the billing period covered by measured intervals. */
  measuredDays: number
  /** Projected cost for the full billing period (estimate). */
  projectedTotalCost: Decimal
  /** Total advances expected over the whole billing period. */
  totalAdvances: Decimal
  /**
   * Positive → Guthaben (credit back to the household).
   * Negative → Nachzahlung (additional payment due).
   */
  balance: Decimal
  estimated: true
  /** True when there is no measured data inside the billing period. */
  insufficientData: boolean
}

export type ForecastError = CostError

/**
 * Forecast a meter's billing period.
 *
 * Approach: compute cost of every measured interval clipped to the billing
 * period (clipping prorates usage linearly per day). Project the remaining
 * unmeasured days using the average daily cost of the measured portion.
 * Advances: monthlyAdvance × number of months in the billing period,
 * approximated as days/365 × 12 when the period is not whole months.
 */
export function forecastBillingPeriod(
  readings: Reading[],
  meterKind: MeterKind,
  tariffs: TariffPeriod[],
  billing: BillingPeriod,
  gasConversions?: GasConversion[],
): Result<Forecast, ForecastError> {
  const series = computeConsumption(readings)
  const periodDays = daysBetween(billing.start, billing.end) + 1

  let accrued = dec(0)
  let measuredDays = 0

  for (const interval of series.intervals) {
    if (interval.days === 0) continue
    // Clip the interval's consumption days (from+1..to) to the billing period.
    const consStart = addDays(interval.from, 1)
    const clipStart = maxDate(consStart, billing.start)
    const clipEnd = minDate(interval.to, billing.end)
    if (compareDates(clipStart, clipEnd) > 0) continue

    const clippedDays = daysBetween(clipStart, clipEnd) + 1
    const fraction = dec(clippedDays).div(interval.days)
    const clippedInterval = {
      ...interval,
      from: addDays(clipStart, -1),
      to: clipEnd,
      days: clippedDays,
      usage: interval.usage.times(fraction),
      dailyAverage: interval.dailyAverage,
    }

    const cost = costInterval(clippedInterval, meterKind, tariffs, gasConversions)
    if (!cost.ok) return cost
    accrued = accrued.plus(cost.value.totalCost)
    measuredDays += clippedDays
  }

  const monthlyAdvance = dec(billing.monthlyAdvance)
  const months = approximateMonths(billing.start, billing.end)
  const totalAdvances = monthlyAdvance.times(months)

  if (measuredDays === 0) {
    return ok({
      accruedCost: dec(0),
      measuredDays: 0,
      projectedTotalCost: dec(0),
      totalAdvances,
      balance: dec(0),
      estimated: true,
      insufficientData: true,
    })
  }

  const dailyCost = accrued.div(measuredDays)
  const projectedTotalCost = dailyCost.times(periodDays)
  const balance = totalAdvances.minus(projectedTotalCost)

  return ok({
    accruedCost: accrued,
    measuredDays,
    projectedTotalCost,
    totalAdvances,
    balance,
    estimated: true,
    insufficientData: false,
  })
}

/**
 * Number of monthly advances in a billing period. Whole-month periods count
 * exactly (e.g. 01.04–31.03 → 12); otherwise approximate via days × 12/365.
 */
export function approximateMonths(start: LocalDate, end: LocalDate): Decimal {
  const startsFirst = start.slice(8, 10) === '01'
  const endNext = addDays(end, 1)
  const endsMonthBoundary = endNext.slice(8, 10) === '01'
  if (startsFirst && endsMonthBoundary) {
    const months =
      (Number(endNext.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
      (Number(endNext.slice(5, 7)) - Number(start.slice(5, 7)))
    return dec(months)
  }
  const days = daysBetween(start, end) + 1
  return dec(days).times(12).div(365)
}

export function isGuthaben(f: Forecast): boolean {
  return f.balance.gte(0)
}

// Portfolio aggregation: money only. Usage across different units must never
// be summed; this function intentionally only accepts money balances.
export function aggregateBalances(balances: Decimal[]): Decimal {
  return balances.reduce((s, b) => s.plus(b), dec(0))
}

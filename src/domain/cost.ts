// Cost calculation with tariff splitting.
// An interval crossing a tariff change is split by day across the applicable
// tariff periods: usage is allocated linearly per day (a labelled estimate),
// while base price accrues per day from each tariff's annual base price.
import { dec, Decimal } from './decimal'
import { addDays, compareDates, daysBetween, minDate, type LocalDate } from './dates'
import { err, ok, type Result } from './result'
import { conversionAt, type GasConversionError } from './gas'
import { conversionFactor } from './gas'
import type { ConsumptionInterval } from './consumption'
import type { GasConversion, MeterKind, TariffPeriod } from './types'

export interface CostSegment {
  tariffId: string
  from: LocalDate
  to: LocalDate
  days: number
  /** Usage allocated to this segment in the meter's native unit. */
  usageNative: Decimal
  /** Usage in the billed unit (kWh for gas after conversion). */
  usageBilled: Decimal
  /** Conversion applied (gas only). */
  gasConversionId?: string
  usageCost: Decimal
  baseCost: Decimal
  /** True when usage was split linearly across days (estimate). */
  prorated: boolean
}

export interface IntervalCost {
  segments: CostSegment[]
  usageCost: Decimal
  baseCost: Decimal
  totalCost: Decimal
}

export type CostError =
  | { kind: 'no-tariff'; date: LocalDate }
  | GasConversionError

const DAYS_PER_YEAR = dec(365)

/** The tariff effective on `date`, or an error when none applies. */
export function tariffAt(tariffs: TariffPeriod[], date: LocalDate): Result<TariffPeriod, CostError> {
  let best: TariffPeriod | undefined
  for (const t of tariffs) {
    if (compareDates(t.effectiveFrom, date) <= 0) {
      if (best === undefined || compareDates(t.effectiveFrom, best.effectiveFrom) > 0) {
        best = t
      }
    }
  }
  return best !== undefined ? ok(best) : err({ kind: 'no-tariff', date })
}

/**
 * Compute cost for a consumption interval, splitting across tariff changes.
 *
 * Semantics: consumption in interval (from, to] is attributed day-by-day to
 * the days from+1 .. to. Each day belongs to the tariff effective on it.
 * If the whole interval falls under one tariff the exact usage is used
 * (prorated=false). Otherwise usage splits linearly per day (prorated=true).
 */
export function costInterval(
  interval: ConsumptionInterval,
  meterKind: MeterKind,
  tariffs: TariffPeriod[],
  gasConversions?: GasConversion[],
): Result<IntervalCost, CostError> {
  if (interval.days === 0) {
    // Same-day interval: no time span; cost only if usage exists under one tariff.
    const t = tariffAt(tariffs, interval.to)
    if (!t.ok) return t
    const billed = toBilled(interval.usage, meterKind, gasConversions, interval.to)
    if (!billed.ok) return billed
    const usageCost = billed.value.usage.times(dec(t.value.unitPrice))
    const seg: CostSegment = {
      tariffId: t.value.id,
      from: interval.from,
      to: interval.to,
      days: 0,
      usageNative: interval.usage,
      usageBilled: billed.value.usage,
      gasConversionId: billed.value.conversionId,
      usageCost,
      baseCost: dec(0),
      prorated: false,
    }
    return ok({ segments: [seg], usageCost, baseCost: dec(0), totalCost: usageCost })
  }

  // Consumption days are from+1 .. to inclusive.
  const firstDay = addDays(interval.from, 1)

  // Collect tariff boundaries inside [firstDay, to].
  const boundaries = tariffs
    .map((t) => t.effectiveFrom)
    .filter((d) => compareDates(d, firstDay) > 0 && compareDates(d, interval.to) <= 0)
    .sort(compareDates)

  const segments: CostSegment[] = []
  const prorated = boundaries.length > 0
  let segStart = firstDay
  const dailyUsage = interval.usage.div(interval.days)

  while (compareDates(segStart, interval.to) <= 0) {
    const nextBoundary = boundaries.find((b) => compareDates(b, segStart) > 0)
    const segEnd = nextBoundary !== undefined ? minDate(addDays(nextBoundary, -1), interval.to) : interval.to

    const t = tariffAt(tariffs, segStart)
    if (!t.ok) return t

    const days = daysBetween(segStart, segEnd) + 1
    const usageNative = prorated
      ? dailyUsage.times(days)
      : interval.usage

    const billed = toBilled(usageNative, meterKind, gasConversions, segStart)
    if (!billed.ok) return billed

    const usageCost = billed.value.usage.times(dec(t.value.unitPrice))
    const baseCost = dec(t.value.basePricePerYear).div(DAYS_PER_YEAR).times(days)

    segments.push({
      tariffId: t.value.id,
      from: segStart,
      to: segEnd,
      days,
      usageNative,
      usageBilled: billed.value.usage,
      gasConversionId: billed.value.conversionId,
      usageCost,
      baseCost,
      prorated,
    })

    segStart = addDays(segEnd, 1)
  }

  const usageCost = segments.reduce((s, x) => s.plus(x.usageCost), dec(0))
  const baseCost = segments.reduce((s, x) => s.plus(x.baseCost), dec(0))
  return ok({ segments, usageCost, baseCost, totalCost: usageCost.plus(baseCost) })
}

function toBilled(
  usageNative: Decimal,
  meterKind: MeterKind,
  gasConversions: GasConversion[] | undefined,
  date: LocalDate,
): Result<{ usage: Decimal; conversionId?: string }, CostError> {
  if (meterKind !== 'gas') return ok({ usage: usageNative })
  const c = conversionAt(gasConversions ?? [], date)
  if (!c.ok) return c
  return ok({ usage: usageNative.times(conversionFactor(c.value)), conversionId: c.value.id })
}

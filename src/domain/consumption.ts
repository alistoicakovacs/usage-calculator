// Interval consumption from cumulative readings.
// The first reading (or a baseline after replacement/reset) creates no
// consumption. A lower reading is never negative consumption; it is surfaced
// as an anomaly requiring an explicit user decision.
import { dec, Decimal } from './decimal'
import { compareDates, daysBetween, type LocalDate } from './dates'
import type { Reading } from './types'

export interface ConsumptionInterval {
  fromReadingId: string
  toReadingId: string
  from: LocalDate
  to: LocalDate
  days: number
  /** Consumption in the meter's native unit for (from, to]. */
  usage: Decimal
  /** usage / days; undefined when days === 0 (same-day correction edge). */
  dailyAverage: Decimal | undefined
}

/** A reading lower than its predecessor: correction, rollover, or replacement. */
export interface DecreaseAnomaly {
  fromReadingId: string
  toReadingId: string
  from: LocalDate
  to: LocalDate
  previousValue: Decimal
  currentValue: Decimal
}

export interface ConsumptionSeries {
  intervals: ConsumptionInterval[]
  anomalies: DecreaseAnomaly[]
}

/**
 * Compute consumption intervals from a meter's readings.
 * Readings are sorted by date. Baseline readings restart the sequence.
 * Decreasing pairs produce anomalies instead of intervals; the series
 * continues from the lower reading so later intervals remain correct
 * once the user resolves the anomaly.
 */
export function computeConsumption(readings: Reading[]): ConsumptionSeries {
  const sorted = [...readings].sort((a, b) => compareDates(a.date, b.date))
  const intervals: ConsumptionInterval[] = []
  const anomalies: DecreaseAnomaly[] = []

  let prev: Reading | undefined
  for (const reading of sorted) {
    if (prev !== undefined && !reading.isBaseline) {
      const prevValue = dec(prev.value)
      const currValue = dec(reading.value)
      if (currValue.lt(prevValue)) {
        anomalies.push({
          fromReadingId: prev.id,
          toReadingId: reading.id,
          from: prev.date,
          to: reading.date,
          previousValue: prevValue,
          currentValue: currValue,
        })
      } else {
        const days = daysBetween(prev.date, reading.date)
        const usage = currValue.minus(prevValue)
        intervals.push({
          fromReadingId: prev.id,
          toReadingId: reading.id,
          from: prev.date,
          to: reading.date,
          days,
          usage,
          dailyAverage: days > 0 ? usage.div(days) : undefined,
        })
      }
    }
    prev = reading
  }

  return { intervals, anomalies }
}

/** Total usage across intervals (single meter, single unit). */
export function totalUsage(intervals: ConsumptionInterval[]): Decimal {
  return intervals.reduce((sum, i) => sum.plus(i.usage), dec(0))
}

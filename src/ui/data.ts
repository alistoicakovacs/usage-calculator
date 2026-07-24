// Shared UI data-loading helpers: assemble a meter's records and derive its
// forecast in one place so the dashboard, meter list, and property views agree.
import type {
  BillingPeriodRow,
  GasConversionRow,
  MeterRow,
  ReadingRow,
  TariffRow,
} from '../data/db'
import {
  billingPeriodRepo,
  gasConversionRepo,
  meterRepo,
  readingRepo,
  tariffRepo,
  type RepoContext,
} from '../data/repos'
import { compareDates, type LocalDate } from '../domain/dates'
import { forecastBillingPeriod, type Forecast } from '../domain/forecast'

export interface MeterBundle {
  meter: MeterRow
  readings: ReadingRow[]
  tariffs: TariffRow[]
  gasConversions: GasConversionRow[]
  billings: BillingPeriodRow[]
}

export async function loadMeterBundle(
  ctx: RepoContext,
  meterId: string,
): Promise<MeterBundle | undefined> {
  const meter = await meterRepo.get(ctx, meterId)
  if (!meter) return undefined
  const [readings, tariffs, gasConversions, billings] = await Promise.all([
    readingRepo.byMeter(ctx, meterId),
    tariffRepo.byMeter(ctx, meterId),
    gasConversionRepo.byMeter(ctx, meterId),
    billingPeriodRepo.byMeter(ctx, meterId),
  ])
  return { meter, readings, tariffs, gasConversions, billings }
}

export async function loadBundlesForProperty(
  ctx: RepoContext,
  propertyId: string,
): Promise<MeterBundle[]> {
  const meters = await meterRepo.byProperty(ctx, propertyId)
  const bundles = await Promise.all(meters.map((m) => loadMeterBundle(ctx, m.id)))
  return bundles.filter((b): b is MeterBundle => b !== undefined)
}

export function lastReading(b: MeterBundle): ReadingRow | undefined {
  return b.readings.length > 0 ? b.readings[b.readings.length - 1] : undefined
}

/** A meter can produce a forecast once it has a tariff and a billing period. */
export function isConfigured(b: MeterBundle): boolean {
  return b.tariffs.length > 0 && b.billings.length > 0
}

/** The billing period covering `today`, else the most recent one. */
export function activeBilling(
  billings: BillingPeriodRow[],
  today: LocalDate,
): BillingPeriodRow | undefined {
  if (billings.length === 0) return undefined
  const covering = billings.find(
    (b) => compareDates(b.start, today) <= 0 && compareDates(today, b.end) <= 0,
  )
  if (covering) return covering
  // billings are sorted ascending by start; the last is the most recent.
  return billings[billings.length - 1]
}

export function todayIso(ctx: RepoContext): LocalDate {
  return new Date(ctx.now()).toISOString().slice(0, 10)
}

/** Forecast for a meter's active billing period, or undefined if not derivable. */
export function meterForecast(b: MeterBundle, today: LocalDate): Forecast | undefined {
  const billing = activeBilling(b.billings, today)
  if (!billing || b.tariffs.length === 0) return undefined
  const result = forecastBillingPeriod(
    b.readings,
    b.meter.kind,
    b.tariffs,
    billing,
    b.gasConversions,
  )
  return result.ok ? result.value : undefined
}

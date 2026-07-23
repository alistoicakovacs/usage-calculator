import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { HomeScreen } from './HomeScreen'
import { makeTestContext, renderScreen } from '../test-utils'
import {
  billingPeriodRepo,
  meterRepo,
  propertyRepo,
  readingRepo,
  tariffRepo,
  type RepoContext,
} from '../../data/repos'

const routes = { '/': <HomeScreen /> }

async function seedForecastable(ctx: RepoContext) {
  const property = await propertyRepo.save(ctx, { label: 'Haus Mühlhausen', postalCode: '99974' })
  const meter = await meterRepo.save(ctx, {
    propertyId: property.id,
    label: 'Strom',
    kind: 'electricity',
  })
  await readingRepo.save(ctx, { meterId: meter.id, date: '2026-01-01', value: '1000' })
  await readingRepo.save(ctx, { meterId: meter.id, date: '2026-01-31', value: '1300' })
  await tariffRepo.save(ctx, {
    meterId: meter.id,
    effectiveFrom: '2025-01-01',
    unitPrice: '0.30',
    basePricePerYear: '0',
  })
  await billingPeriodRepo.save(ctx, {
    meterId: meter.id,
    start: '2026-01-01',
    end: '2026-12-31',
    monthlyAdvance: '100',
  })
  return { property, meter }
}

describe('HomeScreen', () => {
  it('shows empty state with add-property CTA when no properties', async () => {
    const { ctx } = makeTestContext()
    renderScreen(ctx, '/', routes)
    expect(await screen.findByText(/Immobilie hinzufügen/)).toBeInTheDocument()
    expect(screen.getByText(/Noch keine Immobilie/)).toBeInTheDocument()
  })

  it('renders a property card with an action button per meter', async () => {
    const { ctx } = makeTestContext()
    await seedForecastable(ctx)
    renderScreen(ctx, '/', routes)
    expect(await screen.findByText(/Haus Mühlhausen/)).toBeInTheDocument()
    expect(screen.getByText('Zählerstand eintragen')).toBeInTheDocument()
    expect(screen.getByText('Strom')).toBeInTheDocument()
  })

  it('shows a Guthaben forecast chip with the estimate tag', async () => {
    const { ctx } = makeTestContext()
    // 300 kWh in 30 days → 10/day × 0.30 = 3/day → 1095/yr; advances 1200 → Guthaben 105
    await seedForecastable(ctx)
    renderScreen(ctx, '/', routes)
    expect(await screen.findByText(/Guthaben/)).toBeInTheDocument()
    expect(screen.getByText(/105,00 €/)).toBeInTheDocument()
    expect(screen.getByText('geschätzt')).toBeInTheDocument()
  })
})

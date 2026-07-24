import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { HomeScreen } from './HomeScreen'
import { SyncProvider, type SyncContextValue } from '../SyncContext'
import { makeTestContext, renderScreen } from '../test-utils'
import {
  billingPeriodRepo,
  meterRepo,
  propertyRepo,
  readingRepo,
  tariffRepo,
  type RepoContext,
} from '../../data/repos'

const stubSync: SyncContextValue = {
  status: 'disabled',
  conflicts: [],
  syncNow: vi.fn(),
  resolve: vi.fn(),
}

// The dashboard reads sync state (for the conflict badge); give it a stub.
const routes = {
  '/': (
    <SyncProvider value={stubSync}>
      <HomeScreen />
    </SyncProvider>
  ),
}

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
  it('shows an empty state with an add-property CTA when there are no properties', async () => {
    const { ctx } = makeTestContext()
    renderScreen(ctx, '/', routes)
    expect(await screen.findByRole('link', { name: /Erste Immobilie anlegen/ })).toHaveAttribute(
      'href',
      '/property/new',
    )
  })

  it('renders each property with a tappable row per meter', async () => {
    const { ctx } = makeTestContext()
    await seedForecastable(ctx)
    renderScreen(ctx, '/', routes)
    expect(await screen.findByText(/Haus Mühlhausen/)).toBeInTheDocument()
    // The meter is a link into its detail screen.
    expect(screen.getByRole('link', { name: /Strom/ })).toBeInTheDocument()
  })

  it('shows a Guthaben forecast with the euro amount and estimate tag', async () => {
    const { ctx } = makeTestContext()
    // 300 kWh in 30 days → 10/day × 0.30 = 3/day → 1095/yr; advances 1200 → Guthaben 105
    await seedForecastable(ctx)
    renderScreen(ctx, '/', routes)
    // "Guthaben" appears both in the hero caption and the per-meter chip.
    expect((await screen.findAllByText(/Guthaben/)).length).toBeGreaterThan(0)
    expect(screen.getByText(/105,00 €/)).toBeInTheDocument()
    expect(screen.getByText('geschätzt')).toBeInTheDocument()
  })
})

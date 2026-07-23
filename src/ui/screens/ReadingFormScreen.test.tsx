import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { ReadingFormScreen } from './ReadingFormScreen'
import { MeterScreen } from './MeterScreen'
import { makeTestContext, renderScreen } from '../test-utils'
import { meterRepo, readingRepo, type RepoContext } from '../../data/repos'

async function seedMeter(ctx: RepoContext) {
  const meter = await meterRepo.save(ctx, {
    propertyId: 'p1',
    label: 'Strom',
    kind: 'electricity',
  })
  return meter
}

const routes = (extra?: Record<string, React.ReactNode>) => ({
  '/meter/:meterId/reading/:readingId': <ReadingFormScreen />,
  '/meter/:meterId': <MeterScreen />,
  ...extra,
})

describe('ReadingFormScreen', () => {
  it('accepts a valid German-formatted reading and saves it', async () => {
    const { ctx } = makeTestContext()
    const meter = await seedMeter(ctx)
    renderScreen(ctx, `/meter/${meter.id}/reading/new`, routes())

    await screen.findByRole('heading', { name: 'Stand eintragen' })
    fireEvent.change(screen.getByLabelText(/Datum/), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText(/Zählerstand/), { target: { value: '1.234,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    await waitFor(async () => {
      const readings = await readingRepo.byMeter(ctx, meter.id)
      expect(readings).toHaveLength(1)
      expect(readings[0].value).toBe('1234.5')
    })
  })

  it('rejects malformed values with an error message', async () => {
    const { ctx } = makeTestContext()
    const meter = await seedMeter(ctx)
    renderScreen(ctx, `/meter/${meter.id}/reading/new`, routes())

    await screen.findByRole('heading', { name: 'Stand eintragen' })
    fireEvent.change(screen.getByLabelText(/Datum/), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText(/Zählerstand/), { target: { value: '12.34' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText(/Ungültiger Wert/)).toBeInTheDocument()
    expect(await readingRepo.byMeter(ctx, meter.id)).toHaveLength(0)
  })

  it('rejects a duplicate same-date reading', async () => {
    const { ctx } = makeTestContext()
    const meter = await seedMeter(ctx)
    await readingRepo.save(ctx, { meterId: meter.id, date: '2026-01-01', value: '1000' })
    renderScreen(ctx, `/meter/${meter.id}/reading/new`, routes())

    await screen.findByRole('heading', { name: 'Stand eintragen' })
    fireEvent.change(screen.getByLabelText(/Datum/), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText(/Zählerstand/), { target: { value: '1100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    expect(await screen.findByText(/bereits ein Zählerstand/)).toBeInTheDocument()
  })

  it('requires an explicit choice for a decreasing reading, then saves replacement as baseline', async () => {
    const { ctx } = makeTestContext()
    const meter = await seedMeter(ctx)
    await readingRepo.save(ctx, { meterId: meter.id, date: '2026-01-01', value: '1000' })
    renderScreen(ctx, `/meter/${meter.id}/reading/new`, routes())

    await screen.findByRole('heading', { name: 'Stand eintragen' })
    fireEvent.change(screen.getByLabelText(/Datum/), { target: { value: '2026-02-01' } })
    fireEvent.change(screen.getByLabelText(/Zählerstand/), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))

    // Warning appears; save is disabled until a choice is made.
    expect(await screen.findByText(/Niedrigerer Wert/)).toBeInTheDocument()
    const saveBtn = screen.getByRole('button', { name: 'Speichern' })
    expect(saveBtn).toBeDisabled()

    fireEvent.click(screen.getByLabelText(/Zählerwechsel/))
    expect(saveBtn).toBeEnabled()
    fireEvent.click(saveBtn)

    await waitFor(async () => {
      const readings = await readingRepo.byMeter(ctx, meter.id)
      const added = readings.find((r) => r.date === '2026-02-01')
      expect(added?.isBaseline).toBe(true)
      expect(added?.decreaseResolution).toBe('replacement')
    })
  })
})

describe('MeterScreen', () => {
  it('shows interval usage between two readings', async () => {
    const { ctx } = makeTestContext()
    const meter = await seedMeter(ctx)
    await readingRepo.save(ctx, { meterId: meter.id, date: '2026-01-01', value: '1000' })
    await readingRepo.save(ctx, { meterId: meter.id, date: '2026-01-31', value: '1150.5' })
    renderScreen(ctx, `/meter/${meter.id}`, routes())

    // The interval consumption (150,5 kWh) and the reading value (1.150,5 kWh)
    // both contain "150,5 kWh"; assert the exact interval usage node exists.
    const usageMatches = await screen.findAllByText(/150,5 kWh/)
    expect(usageMatches.length).toBeGreaterThanOrEqual(1)
    expect(usageMatches.some((el) => el.textContent?.replace(/\s+/g, ' ').trim() === '150,5 kWh')).toBe(true)
    expect(screen.getByText(/30 Tage/)).toBeInTheDocument()
  })

  it('warns when a gas meter has no conversion values', async () => {
    const { ctx } = makeTestContext()
    const meter = await meterRepo.save(ctx, {
      propertyId: 'p1',
      label: 'Gas',
      kind: 'gas',
    })
    renderScreen(ctx, `/meter/${meter.id}`, routes())

    expect(await screen.findByText(/Brennwert und Zustandszahl fehlen/)).toBeInTheDocument()
  })
})

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SyncProvider, type SyncContextValue } from '../SyncContext'
import type { StoredConflict } from '../../sync/state'
import type { SyncRow } from '../../sync/protocol'
import { ConflictScreen } from './ConflictScreen'

const META = { updatedAt: 1_700_000_000_000, deviceId: 'device-a', versionVector: {} }

const asRow = (fields: Record<string, unknown>): SyncRow =>
  ({ id: 'p1', ...META, ...fields }) as unknown as SyncRow

function labelConflict(overrides: Partial<StoredConflict> = {}): StoredConflict {
  return {
    id: 'properties:p1',
    table: 'properties',
    local: asRow({ label: 'Hauptstraße 5', postalCode: '10115' }),
    remote: asRow({ label: 'Hauptstr. 5', postalCode: '10115' }),
    detectedAt: 1_700_000_000_000,
    ...overrides,
  }
}

function renderScreen(value: Partial<SyncContextValue> = {}) {
  const resolve = vi.fn().mockResolvedValue(undefined)
  const sync: SyncContextValue = {
    status: 'idle',
    conflicts: [labelConflict()],
    syncNow: vi.fn(),
    resolve,
    ...value,
  }
  render(
    <MemoryRouter>
      <SyncProvider value={sync}>
        <ConflictScreen />
      </SyncProvider>
    </MemoryRouter>,
  )
  return { resolve }
}

describe('ConflictScreen', () => {
  it('says so when there is nothing to decide', () => {
    renderScreen({ conflicts: [] })

    expect(screen.getByText(/keine konflikte/i)).toBeInTheDocument()
  })

  it('names what kind of record is in dispute', () => {
    renderScreen()

    expect(screen.getByText(/Immobilie/)).toBeInTheDocument()
  })

  it('shows both versions of the field that differs', () => {
    renderScreen()

    expect(screen.getByText('Hauptstraße 5')).toBeInTheDocument()
    expect(screen.getByText('Hauptstr. 5')).toBeInTheDocument()
  })

  it('marks which side came from this device', () => {
    renderScreen()

    expect(screen.getByText(/dieses gerät/i)).toBeInTheDocument()
    expect(screen.getByText(/anderes gerät/i)).toBeInTheDocument()
  })

  it('keeps this device’s version when the user picks it', () => {
    const { resolve } = renderScreen()

    fireEvent.click(screen.getByRole('button', { name: /diese version behalten/i }))

    expect(resolve).toHaveBeenCalledWith('properties:p1', 'local')
  })

  it('takes the other version when the user picks it', () => {
    const { resolve } = renderScreen()

    fireEvent.click(screen.getByRole('button', { name: /andere version übernehmen/i }))

    expect(resolve).toHaveBeenCalledWith('properties:p1', 'remote')
  })

  it('lists every outstanding conflict', () => {
    renderScreen({
      conflicts: [
        labelConflict(),
        labelConflict({ id: 'properties:p2', local: asRow({ label: 'Zweitwohnung' }) }),
      ],
    })

    expect(screen.getAllByRole('button', { name: /diese version behalten/i })).toHaveLength(2)
  })

  it('spells out a deletion rather than showing an empty column', () => {
    renderScreen({
      conflicts: [labelConflict({ remote: asRow({ deleted: true }) })],
    })

    expect(screen.getByText('Gelöscht')).toBeInTheDocument()
  })

  it('flags the fields that actually differ', () => {
    renderScreen()

    const changed = screen.getByText('Bezeichnung').closest('tr')
    const same = screen.getByText('PLZ').closest('tr')
    expect(changed).toHaveClass('differs')
    expect(same).not.toHaveClass('differs')
  })

  it('shows when the disagreement was noticed', () => {
    renderScreen()

    expect(within(screen.getByRole('article')).getByText(/14\.11\.2023/)).toBeInTheDocument()
  })
})

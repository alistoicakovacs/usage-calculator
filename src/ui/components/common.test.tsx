import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SyncProvider, type SyncContextValue } from '../SyncContext'
import type { StoredConflict } from '../../sync/state'
import { Screen } from './common'

const conflict = (id: string): StoredConflict => ({
  id,
  table: 'properties',
  local: {} as never,
  remote: {} as never,
  detectedAt: 0,
})

function renderScreen(sync?: Partial<SyncContextValue>) {
  const value: SyncContextValue | undefined = sync && {
    status: 'idle',
    conflicts: [],
    syncNow: vi.fn(),
    resolve: vi.fn(),
    ...sync,
  }

  const content = <Screen title="Zählerstand">{null}</Screen>
  render(
    <MemoryRouter>
      {value ? <SyncProvider value={value}>{content}</SyncProvider> : content}
    </MemoryRouter>,
  )
}

describe('Screen', () => {
  it('renders outside a sync provider, as the local-only app did', () => {
    renderScreen()

    expect(screen.getByRole('heading', { name: 'Zählerstand' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /synchronisierung/i })).not.toBeInTheDocument()
  })

  it('offers a way into the sync settings', () => {
    renderScreen({ status: 'idle' })

    expect(screen.getByRole('link', { name: /synchronisierung/i })).toHaveAttribute('href', '/sync')
  })

  it('flags outstanding conflicts and links straight to them', () => {
    renderScreen({ status: 'idle', conflicts: [conflict('a'), conflict('b')] })

    const link = screen.getByRole('link', { name: /2 konflikte/i })
    expect(link).toHaveAttribute('href', '/conflicts')
  })

  it('says when the device cannot reach the server', () => {
    renderScreen({ status: 'offline' })

    expect(screen.getByRole('link', { name: /offline/i })).toBeInTheDocument()
  })
})

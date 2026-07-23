import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../AppContext'
import { VaultProvider } from '../VaultContext'
import { SyncProvider, type SyncContextValue } from '../SyncContext'
import { makeTestContext } from '../test-utils'
import { generateVaultKey } from '../../crypto/keys'
import { getRecoveryKey } from '../../crypto/vault'
import { loadServerUrl, saveServerUrl } from '../../sync/settings'
import * as pairing from '../../sync/pairing'
import type { RepoContext } from '../../data/repos'
import { SyncScreen } from './SyncScreen'

async function renderScreen(sync: Partial<SyncContextValue> = {}) {
  const { ctx } = makeTestContext()
  const { key } = await generateVaultKey()
  const vault = { id: 'vault-42', key }
  const syncNow = vi.fn()
  const value: SyncContextValue = {
    status: 'disabled',
    conflicts: [],
    syncNow,
    resolve: vi.fn(),
    ...sync,
  }

  render(
    <AppProvider value={ctx}>
      <VaultProvider vault={vault}>
        <MemoryRouter>
          <SyncProvider value={value}>
            <SyncScreen />
          </SyncProvider>
        </MemoryRouter>
      </VaultProvider>
    </AppProvider>,
  )
  return { ctx: ctx as RepoContext, syncNow, vault }
}

describe('SyncScreen', () => {
  describe('sync server', () => {
    it('stores a valid server url', async () => {
      const { ctx } = await renderScreen()

      fireEvent.change(screen.getByLabelText(/sync-server/i), {
        target: { value: 'https://sync.example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /speichern/i }))

      await waitFor(async () =>
        expect(await loadServerUrl(ctx.db)).toBe('https://sync.example.com'),
      )
    })

    it('refuses a plain-http address that would leak the token', async () => {
      const { ctx } = await renderScreen()

      fireEvent.change(screen.getByLabelText(/sync-server/i), {
        target: { value: 'http://sync.example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /speichern/i }))

      expect(await screen.findByText(/https/i)).toBeInTheDocument()
      expect(await loadServerUrl(ctx.db)).toBeUndefined()
    })

    it('rejects something that is not an address at all', async () => {
      await renderScreen()

      fireEvent.change(screen.getByLabelText(/sync-server/i), {
        target: { value: 'sync.example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /speichern/i }))

      expect(await screen.findByText(/ungültige adresse/i)).toBeInTheDocument()
    })
  })

  describe('status', () => {
    it('says the device is local-only when no server is set', async () => {
      await renderScreen({ status: 'disabled' })

      expect(screen.getByText(/nur auf diesem gerät/i)).toBeInTheDocument()
    })

    it('reports being offline, and that nothing is lost', async () => {
      await renderScreen({ status: 'offline' })

      expect(screen.getByText(/ihre daten sind sicher/i)).toBeInTheDocument()
    })

    it('reports a rejected vault', async () => {
      await renderScreen({ status: 'unauthorized' })

      expect(screen.getByText(/abgelehnt/i)).toBeInTheDocument()
    })

    it('triggers a round on request', async () => {
      const { syncNow } = await renderScreen({ status: 'idle' })

      fireEvent.click(screen.getByRole('button', { name: /jetzt synchronisieren/i }))

      expect(syncNow).toHaveBeenCalled()
    })

    it('points at the conflicts waiting to be settled', async () => {
      await renderScreen({
        status: 'idle',
        conflicts: [
          {
            id: 'properties:p1',
            table: 'properties',
            local: {} as never,
            remote: {} as never,
            detectedAt: 0,
          },
        ],
      })

      expect(screen.getByRole('link', { name: /1 konflikt lösen/i })).toHaveAttribute(
        'href',
        '/conflicts',
      )
    })
  })

  describe('pairing', () => {
    it('keeps the pairing code hidden until asked', async () => {
      await renderScreen()

      expect(screen.queryByRole('img', { name: /kopplung/i })).not.toBeInTheDocument()
    })

    it('shows a scannable code once revealed', async () => {
      await renderScreen()

      fireEvent.click(screen.getByRole('button', { name: /gerät koppeln/i }))

      expect(await screen.findByRole('img', { name: /kopplung/i })).toBeInTheDocument()
    })

    it('shows the recovery key for typing in by hand', async () => {
      const { vault } = await renderScreen()

      fireEvent.click(screen.getByRole('button', { name: /gerät koppeln/i }))

      expect(await screen.findByText(await getRecoveryKey(vault))).toBeInTheDocument()
    })

    it('shows the vault id, which the other device also needs', async () => {
      await renderScreen()

      fireEvent.click(screen.getByRole('button', { name: /gerät koppeln/i }))

      expect(await screen.findByText('vault-42')).toBeInTheDocument()
    })

    it('warns that the code is as sensitive as the key itself', async () => {
      await renderScreen()

      fireEvent.click(screen.getByRole('button', { name: /gerät koppeln/i }))

      expect(await screen.findByText(/vollen zugriff/i)).toBeInTheDocument()
    })

    it('hands the second device this device’s sync server', async () => {
      const spy = vi.spyOn(pairing, 'buildPairingUrl')
      const { ctx, vault } = await renderScreen()
      await saveServerUrl(ctx.db, 'https://sync.example.workers.dev')

      fireEvent.click(screen.getByRole('button', { name: /gerät koppeln/i }))
      await screen.findByRole('img', { name: /kopplung/i })

      expect(spy).toHaveBeenCalledWith(
        expect.any(String),
        vault.id,
        expect.any(String),
        'https://sync.example.workers.dev',
      )
      spy.mockRestore()
    })

    it('still produces a code when this device syncs nowhere', async () => {
      const spy = vi.spyOn(pairing, 'buildPairingUrl')
      await renderScreen()

      fireEvent.click(screen.getByRole('button', { name: /gerät koppeln/i }))
      await screen.findByRole('img', { name: /kopplung/i })

      expect(spy).toHaveBeenCalledWith(expect.any(String), 'vault-42', expect.any(String), undefined)
      spy.mockRestore()
    })

    it('can hide the code again', async () => {
      await renderScreen()

      fireEvent.click(screen.getByRole('button', { name: /gerät koppeln/i }))
      await screen.findByRole('img', { name: /kopplung/i })
      fireEvent.click(screen.getByRole('button', { name: /verbergen/i }))

      expect(screen.queryByRole('img', { name: /kopplung/i })).not.toBeInTheDocument()
    })
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTestDb } from '../data/db'
import { createVault, loadVault } from '../crypto/vault'
import { buildPairingUrl } from '../sync/pairing'
import { loadServerUrl } from '../sync/settings'
import { VaultGate } from './VaultGate'

let counter = 0
const freshDb = () => createTestDb(`vault-gate-${counter++}-${crypto.randomUUID()}`)

async function pairingLinkFor(serverUrl?: string): Promise<{ vaultId: string; hash: string }> {
  const { vault, recoveryKey } = await createVault(freshDb())
  const url = buildPairingUrl('http://localhost/', vault.id, recoveryKey, serverUrl)
  return { vaultId: vault.id, hash: new URL(url).hash }
}

describe('VaultGate', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('offers to create or restore when there is no vault', async () => {
    render(
      <VaultGate db={freshDb()}>
        <p>geheim</p>
      </VaultGate>,
    )

    expect(await screen.findByRole('button', { name: /neuen tresor anlegen/i })).toBeInTheDocument()
    expect(screen.queryByText('geheim')).not.toBeInTheDocument()
  })

  it('joins the vault named by a scanned pairing link', async () => {
    const db = freshDb()
    const { vaultId, hash } = await pairingLinkFor()
    window.location.hash = hash

    render(
      <VaultGate db={db}>
        <p>geheim</p>
      </VaultGate>,
    )

    expect(await screen.findByText('geheim')).toBeInTheDocument()
    expect((await loadVault(db))?.id).toBe(vaultId)
  })

  it('wipes the key out of the address bar once it is stored', async () => {
    const db = freshDb()
    const { hash } = await pairingLinkFor()
    window.location.hash = hash

    render(
      <VaultGate db={db}>
        <p>geheim</p>
      </VaultGate>,
    )

    await screen.findByText('geheim')
    expect(window.location.hash).not.toContain('k=')
  })

  it('adopts the sync server the pairing link names', async () => {
    const db = freshDb()
    const { hash } = await pairingLinkFor('https://sync.example.workers.dev')
    window.location.hash = hash

    render(
      <VaultGate db={db}>
        <p>geheim</p>
      </VaultGate>,
    )

    await screen.findByText('geheim')
    expect(await loadServerUrl(db)).toBe('https://sync.example.workers.dev')
  })

  it('pairs fine from a link that names no server', async () => {
    const db = freshDb()
    const { hash } = await pairingLinkFor()
    window.location.hash = hash

    render(
      <VaultGate db={db}>
        <p>geheim</p>
      </VaultGate>,
    )

    await screen.findByText('geheim')
    expect(await loadServerUrl(db)).toBeUndefined()
  })

  it('refuses a plain-http server smuggled in through a link', async () => {
    // A scanned code is not a trusted source. http would put the vault's
    // bearer token on the wire in the clear.
    const db = freshDb()
    const { hash } = await pairingLinkFor('http://evil.example.com')
    window.location.hash = hash

    render(
      <VaultGate db={db}>
        <p>geheim</p>
      </VaultGate>,
    )

    await screen.findByText('geheim')
    expect(await loadServerUrl(db)).toBeUndefined()
  })

  it('falls back to the first-run screen when the link is damaged', async () => {
    window.location.hash = '#/pair?id=vault-1&k=NOT-A-VALID-KEY'

    render(
      <VaultGate db={freshDb()}>
        <p>geheim</p>
      </VaultGate>,
    )

    expect(await screen.findByRole('button', { name: /neuen tresor anlegen/i })).toBeInTheDocument()
  })

  it('does not let a pairing link replace a vault this device already has', async () => {
    const db = freshDb()
    const existing = await createVault(db)
    const { hash } = await pairingLinkFor()
    window.location.hash = hash

    render(
      <VaultGate db={db}>
        <p>geheim</p>
      </VaultGate>,
    )

    await screen.findByText('geheim')
    expect((await loadVault(db))?.id).toBe(existing.vault.id)
  })
})

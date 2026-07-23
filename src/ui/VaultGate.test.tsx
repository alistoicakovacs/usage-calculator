import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createTestDb } from '../data/db'
import { createVault, loadVault } from '../crypto/vault'
import { buildPairingUrl } from '../sync/pairing'
import { VaultGate } from './VaultGate'

let counter = 0
const freshDb = () => createTestDb(`vault-gate-${counter++}-${crypto.randomUUID()}`)

async function pairingLinkFor(): Promise<{ vaultId: string; hash: string }> {
  const { vault, recoveryKey } = await createVault(freshDb())
  const url = buildPairingUrl('http://localhost/', vault.id, recoveryKey)
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

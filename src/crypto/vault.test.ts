import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type AppDatabase } from '../data/db'
import { createVault, forgetVault, getRecoveryKey, loadVault, restoreVault } from './vault'
import { decryptRecord, encryptRecord } from './keys'

let db: AppDatabase

beforeEach(() => {
  db = createTestDb(`vault-test-${crypto.randomUUID()}`)
})

describe('vault lifecycle', () => {
  it('creates a vault with an id and a recovery key', async () => {
    const { vault, recoveryKey } = await createVault(db)
    expect(vault.id).toBeTruthy()
    expect(recoveryKey).toMatch(/^[0-9A-Z-]+$/)
  })

  it('persists and reloads the same vault key', async () => {
    const { vault } = await createVault(db)
    const record = { secret: 'value', n: 7 }
    const env = await encryptRecord(vault.key, record)

    const reloaded = await loadVault(db)
    expect(reloaded?.id).toBe(vault.id)
    const back = await decryptRecord<typeof record>(reloaded!.key, env)
    expect(back.ok && back.value).toEqual(record)
  })

  it('returns undefined when no vault exists', async () => {
    expect(await loadVault(db)).toBeUndefined()
  })

  it('restores a vault from its recovery key and decrypts existing data', async () => {
    const { vault, recoveryKey } = await createVault(db)
    const env = await encryptRecord(vault.key, { m: 'hidden' })

    // Simulate a new device: fresh db, restore from id + recovery key.
    const db2 = createTestDb(`vault-test2-${crypto.randomUUID()}`)
    const restored = await restoreVault(db2, vault.id, recoveryKey)
    expect(restored.ok).toBe(true)
    if (restored.ok) {
      const back = await decryptRecord<{ m: string }>(restored.vault.key, env)
      expect(back.ok && back.value.m).toBe('hidden')
    }
  })

  it('rejects an invalid recovery key', async () => {
    const restored = await restoreVault(db, 'vault-x', 'NOT-A-VALID-KEY')
    expect(restored.ok).toBe(false)
  })

  it('re-derives the same recovery key for display', async () => {
    const { vault, recoveryKey } = await createVault(db)
    expect(await getRecoveryKey(vault)).toBe(recoveryKey)
  })

  it('forgets vault material', async () => {
    await createVault(db)
    await forgetVault(db)
    expect(await loadVault(db)).toBeUndefined()
  })
})

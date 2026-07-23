// Vault lifecycle: create a new encrypted vault or restore one from a recovery
// key. Vault metadata (id + raw key) lives in the local, non-synchronized
// localState table. The key stays on-device; only ciphertext is ever uploaded.
import type { AppDatabase } from '../data/db'
import { decodeRecoveryKey, encodeRecoveryKey } from './recovery'
import {
  exportRawKey,
  generateVaultKey,
  importRawKey,
  toBase64,
  fromBase64,
  type VaultKey,
} from './keys'

const VAULT_ID_KEY = 'vaultId'
const VAULT_RAWKEY_KEY = 'vaultRawKey'

export interface Vault {
  id: string
  key: VaultKey
}

/** Create a new vault: fresh id + key. Returns the vault and its recovery key. */
export async function createVault(db: AppDatabase): Promise<{ vault: Vault; recoveryKey: string }> {
  const id = crypto.randomUUID()
  const { key, raw } = await generateVaultKey()
  await persist(db, id, raw)
  return { vault: { id, key }, recoveryKey: encodeRecoveryKey(raw) }
}

export type RestoreError = { kind: 'invalid-recovery-key' }

/**
 * Restore a vault from a recovery key. The vault id is provided out-of-band
 * during pairing (Phase 4); for local restore without pairing we accept an
 * explicit id, defaulting to a deterministic id derived from the key is NOT
 * done (ids are random), so callers pass the id from the pairing payload.
 */
export async function restoreVault(
  db: AppDatabase,
  vaultId: string,
  recoveryKey: string,
): Promise<{ ok: true; vault: Vault } | { ok: false; error: RestoreError }> {
  const decoded = decodeRecoveryKey(recoveryKey)
  if (!decoded.ok) return { ok: false, error: { kind: 'invalid-recovery-key' } }
  const key = await importRawKey(decoded.key)
  await persist(db, vaultId, decoded.key)
  return { ok: true, vault: { id: vaultId, key } }
}

/** Load an existing vault from local storage, if one has been created. */
export async function loadVault(db: AppDatabase): Promise<Vault | undefined> {
  const idRow = await db.localState.get(VAULT_ID_KEY)
  const keyRow = await db.localState.get(VAULT_RAWKEY_KEY)
  if (!idRow || !keyRow) return undefined
  const key = await importRawKey(fromBase64(keyRow.value))
  return { id: idRow.value, key }
}

/** Re-derive the recovery key for display (e.g. "show my recovery key" again). */
export async function getRecoveryKey(vault: Vault): Promise<string> {
  const raw = await exportRawKey(vault.key)
  return encodeRecoveryKey(raw)
}

/** Remove local vault material (does not touch encrypted records). */
export async function forgetVault(db: AppDatabase): Promise<void> {
  await db.localState.delete(VAULT_ID_KEY)
  await db.localState.delete(VAULT_RAWKEY_KEY)
}

async function persist(db: AppDatabase, id: string, raw: Uint8Array): Promise<void> {
  await db.localState.put({ key: VAULT_ID_KEY, value: id })
  await db.localState.put({ key: VAULT_RAWKEY_KEY, value: toBase64(raw) })
}

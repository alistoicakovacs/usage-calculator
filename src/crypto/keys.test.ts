import { describe, expect, it } from 'vitest'
import {
  canonicalJson,
  decryptRecord,
  deriveSyncToken,
  encryptRecord,
  exportRawKey,
  generateVaultKey,
  importRawKey,
} from './keys'

describe('canonicalJson', () => {
  it('sorts object keys deterministically', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(canonicalJson({ x: { z: 1, y: 2 } })).toBe('{"x":{"y":2,"z":1}}')
  })

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]')
  })
})

describe('AES-GCM record encryption', () => {
  it('round-trips a record', async () => {
    const { key } = await generateVaultKey()
    const record = { id: 'r1', value: '1234.56', date: '2026-01-01' }
    const env = await encryptRecord(key, record)
    const back = await decryptRecord<typeof record>(key, env)
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.value).toEqual(record)
  })

  it('produces different ciphertext each time (random IV)', async () => {
    const { key } = await generateVaultKey()
    const a = await encryptRecord(key, { x: 1 })
    const b = await encryptRecord(key, { x: 1 })
    expect(a.ct).not.toBe(b.ct)
    expect(a.iv).not.toBe(b.iv)
  })

  it('fails to decrypt with the wrong key', async () => {
    const { key: k1 } = await generateVaultKey()
    const { key: k2 } = await generateVaultKey()
    const env = await encryptRecord(k1, { secret: 'value' })
    const back = await decryptRecord(k2, env)
    expect(back.ok).toBe(false)
    if (!back.ok) expect(back.error.kind).toBe('decrypt-failed')
  })

  it('detects tampering (GCM auth failure)', async () => {
    const { key } = await generateVaultKey()
    const env = await encryptRecord(key, { secret: 'value' })
    // Flip a byte in the ciphertext.
    const bytes = atob(env.ct).split('')
    bytes[0] = bytes[0] === 'A' ? 'B' : 'A'
    const tampered = { iv: env.iv, ct: btoa(bytes.join('')) }
    const back = await decryptRecord(key, tampered)
    expect(back.ok).toBe(false)
  })

  it('key export/import preserves encryption compatibility', async () => {
    const { key, raw } = await generateVaultKey()
    const env = await encryptRecord(key, { n: 42 })
    const reimported = await importRawKey(raw)
    const back = await decryptRecord<{ n: number }>(reimported, env)
    expect(back.ok && back.value.n).toBe(42)
    expect([...(await exportRawKey(key))]).toEqual([...raw])
  })
})

describe('deriveSyncToken', () => {
  it('is deterministic per key+vaultId', async () => {
    const { key } = await generateVaultKey()
    const t1 = await deriveSyncToken(key, 'vault-1')
    const t2 = await deriveSyncToken(key, 'vault-1')
    expect(t1).toBe(t2)
  })

  it('differs across vault ids and keys', async () => {
    const { key: k1 } = await generateVaultKey()
    const { key: k2 } = await generateVaultKey()
    expect(await deriveSyncToken(k1, 'a')).not.toBe(await deriveSyncToken(k1, 'b'))
    expect(await deriveSyncToken(k1, 'a')).not.toBe(await deriveSyncToken(k2, 'a'))
  })
})

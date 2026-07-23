// Vault key management and AES-GCM record encryption.
//
// Threat model (per design doc): the device is trusted; the sync server and
// network transit are NOT. The vault key is generated on-device, never leaves
// it in plaintext, and is used to encrypt every record before upload. The
// server only ever sees ciphertext. Losing all devices AND the recovery key
// means the data is unrecoverable by design.

export type VaultKey = CryptoKey

const KEY_BYTES = 32 // AES-256
const IV_BYTES = 12 // GCM standard

/**
 * Copy bytes into a fresh ArrayBuffer-backed Uint8Array. WebCrypto's typings
 * require BufferSource backed by ArrayBuffer (not SharedArrayBuffer), so this
 * normalizes any Uint8Array before passing it to subtle crypto.
 */
function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length)
  out.set(bytes)
  return out as Uint8Array<ArrayBuffer>
}

/** Generate a fresh random 256-bit vault key. */
export async function generateVaultKey(): Promise<{ key: VaultKey; raw: Uint8Array }> {
  const raw = crypto.getRandomValues(new Uint8Array(KEY_BYTES))
  const key = await importRawKey(raw)
  return { key, raw }
}

/** Import raw key bytes into a non-extractable-by-default AES-GCM CryptoKey. */
export async function importRawKey(raw: Uint8Array): Promise<VaultKey> {
  return crypto.subtle.importKey('raw', buf(raw), { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ])
}

export async function exportRawKey(key: VaultKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key))
}

/** Encrypted envelope: iv + ciphertext, both base64. Opaque to the server. */
export interface Envelope {
  iv: string
  ct: string
}

/** Deterministic JSON: object keys sorted recursively, so tests are stable. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortDeep((value as Record<string, unknown>)[k])
    }
    return out
  }
  return value
}

const enc = new TextEncoder()
const dec = new TextDecoder()

export async function encryptRecord(key: VaultKey, record: unknown): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plaintext = buf(enc.encode(canonicalJson(record)))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { iv: toBase64(iv), ct: toBase64(new Uint8Array(ct)) }
}

export type DecryptError = { kind: 'decrypt-failed' }

export async function decryptRecord<T>(
  key: VaultKey,
  envelope: Envelope,
): Promise<{ ok: true; value: T } | { ok: false; error: DecryptError }> {
  try {
    const iv = fromBase64(envelope.iv)
    const ct = fromBase64(envelope.ct)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(iv) }, key, buf(ct))
    return { ok: true, value: JSON.parse(dec.decode(plaintext)) as T }
  } catch {
    // GCM authentication failure (tampering or wrong key) lands here.
    return { ok: false, error: { kind: 'decrypt-failed' } }
  }
}

/**
 * Derive a sync auth token from the vault key + vault id via HMAC. The server
 * stores/checks this token but can never derive the key from it, so it never
 * gains read access to the ciphertext it holds.
 */
export async function deriveSyncToken(key: VaultKey, vaultId: string): Promise<string> {
  const raw = await exportRawKey(key)
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    buf(raw),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', hmacKey, buf(enc.encode(`sync-token:${vaultId}`)))
  return toBase64(new Uint8Array(sig))
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

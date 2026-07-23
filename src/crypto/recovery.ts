// Recovery-key codec: encodes the 256-bit vault key as human-readable groups
// of Crockford base32 with a checksum, so a user can write it down and restore.
//
// Format: 8 groups of 5 chars separated by hyphens, plus a final checksum group.
// Example: "A1B2C-D3E4F-...". Case-insensitive; ambiguous chars (I,L,O,U) excluded.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32 (no I,L,O,U)

const NORMALIZE: Record<string, string> = {
  I: '1',
  L: '1',
  O: '0',
  U: 'V',
}

/** Encode raw bytes to a base32 string (no padding). */
function bytesToBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31]
  }
  return out
}

function base32ToBytes(str: string): Uint8Array {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of str) {
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

/** Simple additive checksum char over the key bytes. */
function checksumChar(bytes: Uint8Array): string {
  let sum = 0
  for (const b of bytes) sum = (sum + b) % 32
  return ALPHABET[sum]
}

/** Format a 32-byte key as a grouped recovery key with a checksum group. */
export function encodeRecoveryKey(key: Uint8Array): string {
  const body = bytesToBase32(key)
  const check = checksumChar(key)
  const full = body + check
  const groups: string[] = []
  for (let i = 0; i < full.length; i += 5) {
    groups.push(full.slice(i, i + 5))
  }
  return groups.join('-')
}

export type RecoveryDecodeError =
  | { kind: 'malformed' }
  | { kind: 'checksum-mismatch' }
  | { kind: 'wrong-length' }

/** Parse a recovery key back to raw bytes, validating the checksum. */
export function decodeRecoveryKey(
  input: string,
  expectedBytes = 32,
): { ok: true; key: Uint8Array } | { ok: false; error: RecoveryDecodeError } {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .split('')
    .map((c) => NORMALIZE[c] ?? c)
    .join('')

  if (cleaned.length === 0) return { ok: false, error: { kind: 'malformed' } }
  for (const ch of cleaned) {
    if (ALPHABET.indexOf(ch) === -1) return { ok: false, error: { kind: 'malformed' } }
  }

  const body = cleaned.slice(0, -1)
  const check = cleaned.slice(-1)
  const key = base32ToBytes(body)

  if (key.length !== expectedBytes) return { ok: false, error: { kind: 'wrong-length' } }
  if (checksumChar(key) !== check) return { ok: false, error: { kind: 'checksum-mismatch' } }
  return { ok: true, key }
}

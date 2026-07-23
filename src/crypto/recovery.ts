// Recovery-key codec: encodes the 256-bit vault key as human-readable groups
// of Crockford base32 with a checksum, so a user can write it down and restore.
//
// Format: the base32 body plus two check symbols, hyphenated every 5 chars.
// Example: "A1B2C-D3E4F-...". Case-insensitive; ambiguous chars (I,L,O,U) excluded.
//
// The check symbols are a position-weighted sum of the body characters, taken
// modulo a prime. That construction catches *every* single-character typo and
// every adjacent transposition, which a plain sum cannot: one base32 character
// moves one byte by a multiple of 8, so a sum taken mod 32 loses the change
// entirely about one time in seven. Weighting by position and reducing mod a
// prime larger than the body means no single wrong character can leave the
// total unchanged.
//
// Keys issued under the old one-character checksum are still accepted on the
// way in — they differ in length, so there is no ambiguity — because the vault
// key itself never changed and a key someone wrote down must keep working.

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

/** Number of trailing check symbols in the current format. */
const CHECK_SYMBOLS = 2

/**
 * Largest prime below 32^CHECK_SYMBOLS, so the checksum both fits in the check
 * symbols and stays prime. Primality is what guarantees `(position × delta)`
 * can never be zero for a single wrong character.
 */
const CHECK_MODULUS = 1021

function checksum(body: string): string {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    sum = (sum + (i + 1) * ALPHABET.indexOf(body[i])) % CHECK_MODULUS
  }
  return ALPHABET[Math.floor(sum / 32)] + ALPHABET[sum % 32]
}

/** The pre-2026-07 checksum: one character holding the byte sum mod 32. */
function legacyChecksumChar(bytes: Uint8Array): string {
  let sum = 0
  for (const b of bytes) sum = (sum + b) % 32
  return ALPHABET[sum]
}

/** How many base32 characters a key of this many bytes takes up. */
function bodyLength(byteCount: number): number {
  return Math.ceil((byteCount * 8) / 5)
}

/** Format a key as a grouped recovery key with its check symbols. */
export function encodeRecoveryKey(key: Uint8Array): string {
  const body = bytesToBase32(key)
  const full = body + checksum(body)
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

  // Current and legacy keys differ in length, so the format is unambiguous.
  const expectedBody = bodyLength(expectedBytes)
  const body = cleaned.slice(0, expectedBody)
  const check = cleaned.slice(expectedBody)
  const key = base32ToBytes(body)

  if (key.length !== expectedBytes) return { ok: false, error: { kind: 'wrong-length' } }

  const matches =
    check.length === CHECK_SYMBOLS
      ? checksum(body) === check
      : check.length === 1 && legacyChecksumChar(key) === check

  if (check.length !== CHECK_SYMBOLS && check.length !== 1) {
    return { ok: false, error: { kind: 'wrong-length' } }
  }
  if (!matches) return { ok: false, error: { kind: 'checksum-mismatch' } }
  return { ok: true, key }
}

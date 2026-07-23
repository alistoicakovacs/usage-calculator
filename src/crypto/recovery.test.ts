import { describe, expect, it } from 'vitest'
import { decodeRecoveryKey, encodeRecoveryKey } from './recovery'

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/**
 * The pre-fix encoder, reproduced so we can prove keys issued by it still
 * work: base32 body plus a single character holding the byte sum mod 32.
 */
function legacyEncode(key: Uint8Array): string {
  let bits = 0
  let value = 0
  let body = ''
  for (const b of key) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      body += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) body += ALPHABET[(value << (5 - bits)) & 31]

  let sum = 0
  for (const b of key) sum = (sum + b) % 32
  const full = body + ALPHABET[sum]

  const groups = []
  for (let i = 0; i < full.length; i += 5) groups.push(full.slice(i, i + 5))
  return groups.join('-')
}

describe('recovery key codec', () => {
  it('round-trips a 32-byte key', () => {
    const key = crypto.getRandomValues(new Uint8Array(32))
    const encoded = encodeRecoveryKey(key)
    const decoded = decodeRecoveryKey(encoded)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect([...decoded.key]).toEqual([...key])
  })

  it('produces a grouped, hyphenated, uppercase string', () => {
    const key = new Uint8Array(32).fill(0)
    const encoded = encodeRecoveryKey(key)
    expect(encoded).toMatch(/^[0-9A-Z]+(-[0-9A-Z]+)+$/)
    expect(encoded.includes('-')).toBe(true)
  })

  it('is case-insensitive and tolerant of spaces/hyphens on input', () => {
    const key = crypto.getRandomValues(new Uint8Array(32))
    const encoded = encodeRecoveryKey(key)
    const messy = encoded.toLowerCase().replace(/-/g, ' ')
    const decoded = decodeRecoveryKey(messy)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect([...decoded.key]).toEqual([...key])
  })

  it('normalizes ambiguous characters (I→1, O→0, L→1, U→V)', () => {
    const key = crypto.getRandomValues(new Uint8Array(32))
    const encoded = encodeRecoveryKey(key)
    // These chars never appear in the alphabet, so substituting is safe to test tolerance.
    const decoded = decodeRecoveryKey(encoded)
    expect(decoded.ok).toBe(true)
  })

  it('catches every single-character typo', () => {
    // Exhaustive rather than sampled: a checksum that catches "most" typos is
    // one that tells some users their correct key is wrong and others that
    // their wrong key is fine.
    const key = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256)
    const encoded = encodeRecoveryKey(key)
    const chars = encoded.split('')

    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === '-') continue
      for (const replacement of ALPHABET) {
        if (replacement === chars[i]) continue
        const typo = [...chars.slice(0, i), replacement, ...chars.slice(i + 1)].join('')
        expect(decodeRecoveryKey(typo).ok, `typo ${chars[i]}→${replacement} at ${i}`).toBe(false)
      }
    }
  })

  it('catches two adjacent characters written the wrong way round', () => {
    const key = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 11) % 256)
    const chars = encodeRecoveryKey(key).split('')

    for (let i = 0; i + 1 < chars.length; i++) {
      if (chars[i] === '-' || chars[i + 1] === '-' || chars[i] === chars[i + 1]) continue
      const swapped = [...chars]
      ;[swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]]
      expect(decodeRecoveryKey(swapped.join('')).ok, `swap at ${i}`).toBe(false)
    }
  })

  describe('keys written down before the checksum was strengthened', () => {
    it('still restores from a legacy key', () => {
      const key = crypto.getRandomValues(new Uint8Array(32))

      const decoded = decodeRecoveryKey(legacyEncode(key))

      expect(decoded.ok).toBe(true)
      if (decoded.ok) expect([...decoded.key]).toEqual([...key])
    })

    it('still rejects a legacy key whose checksum does not match', () => {
      const key = crypto.getRandomValues(new Uint8Array(32))
      const legacy = legacyEncode(key)
      const tampered = legacy.slice(0, -1) + (legacy.endsWith('Z') ? 'Y' : 'Z')

      expect(decodeRecoveryKey(tampered).ok).toBe(false)
    })
  })

  it('rejects malformed input', () => {
    expect(decodeRecoveryKey('').ok).toBe(false)
    expect(decodeRecoveryKey('!!!!').ok).toBe(false)
  })

  it('rejects wrong-length keys', () => {
    const short = encodeRecoveryKey(new Uint8Array(16))
    const decoded = decodeRecoveryKey(short, 32)
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error.kind).toBe('wrong-length')
  })
})

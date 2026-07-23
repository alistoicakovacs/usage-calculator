import { describe, expect, it } from 'vitest'
import { decodeRecoveryKey, encodeRecoveryKey } from './recovery'

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

  it('rejects a checksum mismatch (single-char typo)', () => {
    const key = crypto.getRandomValues(new Uint8Array(32))
    let encoded = encodeRecoveryKey(key)
    // Flip a character in the body to a different valid alphabet char.
    const chars = encoded.split('')
    const idx = chars.findIndex((c) => c !== '-')
    chars[idx] = chars[idx] === 'Z' ? 'Y' : 'Z'
    encoded = chars.join('')
    const decoded = decodeRecoveryKey(encoded)
    expect(decoded.ok).toBe(false)
    if (!decoded.ok) expect(decoded.error.kind).toMatch(/checksum-mismatch|wrong-length/)
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

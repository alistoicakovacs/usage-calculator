import { describe, expect, it } from 'vitest'
import { PAIR_ROUTE, buildPairingUrl, parsePairingHash } from './pairing'

const APP = 'https://alistoicakovacs.github.io/usage-calculator/'
const KEY = 'ABCDE-FGHJK-MNPQR-STVWX-YZ012-34567-89ABC-DEFGH-J'

describe('buildPairingUrl', () => {
  it('points at the app that generated it', () => {
    expect(buildPairingUrl(APP, 'vault-1', KEY).startsWith(APP)).toBe(true)
  })

  it('carries the vault and key in the fragment, never the query', () => {
    const url = new URL(buildPairingUrl(APP, 'vault-1', KEY))

    expect(url.search).toBe('')
    expect(url.hash).toContain('vault-1')
  })

  it('routes the scanning device straight to pairing', () => {
    expect(buildPairingUrl(APP, 'vault-1', KEY)).toContain(`#${PAIR_ROUTE}`)
  })

  it('escapes a vault id containing url punctuation', () => {
    const url = buildPairingUrl(APP, 'a&b=c', KEY)

    expect(parsePairingHash(new URL(url).hash)?.vaultId).toBe('a&b=c')
  })
})

describe('parsePairingHash', () => {
  it('reads back what buildPairingUrl wrote', () => {
    const url = buildPairingUrl(APP, 'vault-1', KEY)

    expect(parsePairingHash(new URL(url).hash)).toEqual({ vaultId: 'vault-1', recoveryKey: KEY })
  })

  it('accepts a hash without its leading marker', () => {
    const hash = new URL(buildPairingUrl(APP, 'vault-1', KEY)).hash.slice(1)

    expect(parsePairingHash(hash)?.vaultId).toBe('vault-1')
  })

  it('ignores a hash that is not a pairing link', () => {
    expect(parsePairingHash('#/meter/123')).toBeUndefined()
  })

  it('ignores a pairing link missing the key', () => {
    expect(parsePairingHash('#/pair?id=vault-1')).toBeUndefined()
  })

  it('ignores a pairing link missing the vault id', () => {
    expect(parsePairingHash(`#/pair?k=${encodeURIComponent(KEY)}`)).toBeUndefined()
  })

  it('ignores an empty hash', () => {
    expect(parsePairingHash('')).toBeUndefined()
  })
})

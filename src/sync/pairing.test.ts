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

describe('the sync server it carries', () => {
  const SERVER = 'https://sync.example.workers.dev'

  it('passes the server on to the scanning device', () => {
    const url = buildPairingUrl(APP, 'vault-1', KEY, SERVER)

    expect(parsePairingHash(new URL(url).hash)?.serverUrl).toBe(SERVER)
  })

  it('leaves it out when this device syncs nowhere', () => {
    const url = buildPairingUrl(APP, 'vault-1', KEY)

    expect(new URL(url).hash).not.toContain('s=')
    expect(parsePairingHash(new URL(url).hash)?.serverUrl).toBeUndefined()
  })

  it('still pairs when the link predates this field', () => {
    const payload = parsePairingHash(`#/pair?id=vault-1&k=${encodeURIComponent(KEY)}`)

    expect(payload).toMatchObject({ vaultId: 'vault-1', recoveryKey: KEY })
  })

  it('escapes a server url so it cannot break out of its parameter', () => {
    const url = buildPairingUrl(APP, 'vault-1', KEY, 'https://x.dev/?a=1&k=stolen')

    expect(parsePairingHash(new URL(url).hash)?.recoveryKey).toBe(KEY)
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

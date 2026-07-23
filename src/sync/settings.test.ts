import { describe, expect, it } from 'vitest'
import { normalizeServerUrl } from './settings'

describe('normalizeServerUrl', () => {
  it('accepts an https origin', () => {
    expect(normalizeServerUrl('https://sync.example.com')).toEqual({
      ok: true,
      url: 'https://sync.example.com',
    })
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeServerUrl('  https://sync.example.com  ')).toMatchObject({ ok: true })
  })

  it('drops a trailing slash so paths join cleanly', () => {
    expect(normalizeServerUrl('https://sync.example.com/')).toEqual({
      ok: true,
      url: 'https://sync.example.com',
    })
  })

  it('keeps a path prefix for servers hosted under a subpath', () => {
    expect(normalizeServerUrl('https://example.com/sync/')).toEqual({
      ok: true,
      url: 'https://example.com/sync',
    })
  })

  it('allows http on localhost for development', () => {
    expect(normalizeServerUrl('http://localhost:8787')).toMatchObject({ ok: true })
  })

  it('refuses plain http elsewhere, which would put the token on the wire', () => {
    expect(normalizeServerUrl('http://sync.example.com')).toEqual({
      ok: false,
      error: 'insecure',
    })
  })

  it('refuses something that is not a url', () => {
    expect(normalizeServerUrl('sync.example.com')).toEqual({ ok: false, error: 'malformed' })
  })

  it('refuses an empty string', () => {
    expect(normalizeServerUrl('   ')).toEqual({ ok: false, error: 'malformed' })
  })
})

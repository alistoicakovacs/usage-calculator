import { describe, expect, it } from 'vitest'
import { backoffDelay, httpTransport } from './transport'

const ENVELOPE = { iv: 'AAECAwQFBgcICQoL', ct: 'Y2lwaGVy' }

interface Call {
  url: string
  init?: RequestInit
}

/** A fetch stand-in that records what it was asked and replies with a script. */
function stubFetch(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return reply({ url, init })
  }
  return { calls, fetcher: fetcher as unknown as typeof fetch }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function transportWith(fetcher: typeof fetch) {
  return httpTransport({
    baseUrl: 'https://sync.example.com',
    vaultId: 'vault-1',
    token: 'secret-token',
    fetch: fetcher,
  })
}

describe('pull', () => {
  it('asks for everything after the given version', async () => {
    const { calls, fetcher } = stubFetch(() => json({ version: 3, records: [] }))

    await transportWith(fetcher).pull(2)

    expect(calls[0].url).toBe('https://sync.example.com/vault/vault-1/pull?since=2')
  })

  it('presents the vault token as a bearer', async () => {
    const { calls, fetcher } = stubFetch(() => json({ version: 0, records: [] }))

    await transportWith(fetcher).pull(0)

    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe('Bearer secret-token')
  })

  it('returns the records the server sent', async () => {
    const record = { table: 'readings', recordId: 'r1', envelope: ENVELOPE, version: 1 }
    const { fetcher } = stubFetch(() => json({ version: 1, records: [record] }))

    const result = await transportWith(fetcher).pull(0)

    expect(result).toEqual({ ok: true, version: 1, records: [record] })
  })

  it('reports a rejected token as unauthorized', async () => {
    const { fetcher } = stubFetch(() => json({ error: 'unauthorized' }, 401))

    expect(await transportWith(fetcher).pull(0)).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('reports an unreachable server as a network failure', async () => {
    const { fetcher } = stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })

    expect(await transportWith(fetcher).pull(0)).toEqual({ ok: false, reason: 'network' })
  })

  it('treats a server error as retryable rather than fatal', async () => {
    const { fetcher } = stubFetch(() => json({ error: 'boom' }, 500))

    expect(await transportWith(fetcher).pull(0)).toEqual({ ok: false, reason: 'network' })
  })

  it('does not choke on a body that is not JSON', async () => {
    const { fetcher } = stubFetch(() => new Response('<html>gateway</html>', { status: 200 }))

    expect(await transportWith(fetcher).pull(0)).toEqual({ ok: false, reason: 'network' })
  })
})

describe('push', () => {
  const request = {
    baseVersion: 1,
    records: [{ table: 'readings' as const, recordId: 'r1', envelope: ENVELOPE }],
  }

  it('posts the batch to the vault push endpoint', async () => {
    const { calls, fetcher } = stubFetch(() => json({ version: 2 }))

    await transportWith(fetcher).push(request)

    expect(calls[0].url).toBe('https://sync.example.com/vault/vault-1/push')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(request)
  })

  it('returns the new version on success', async () => {
    const { fetcher } = stubFetch(() => json({ version: 2 }))

    expect(await transportWith(fetcher).push(request)).toEqual({ ok: true, version: 2 })
  })

  it('surfaces a stale rejection with the records it missed', async () => {
    const missed = { table: 'meters', recordId: 'm1', envelope: ENVELOPE, version: 2 }
    const { fetcher } = stubFetch(() => json({ version: 2, records: [missed] }, 409))

    expect(await transportWith(fetcher).push(request)).toEqual({
      ok: false,
      reason: 'stale',
      version: 2,
      records: [missed],
    })
  })

  it('reports a rejected token as unauthorized', async () => {
    const { fetcher } = stubFetch(() => json({ error: 'unauthorized' }, 401))

    expect(await transportWith(fetcher).push(request)).toEqual({
      ok: false,
      reason: 'unauthorized',
    })
  })

  it('reports an unreachable server as a network failure', async () => {
    const { fetcher } = stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })

    expect(await transportWith(fetcher).push(request)).toEqual({ ok: false, reason: 'network' })
  })

  it('joins a base url that ends in a slash without doubling it', async () => {
    const { calls, fetcher } = stubFetch(() => json({ version: 1 }))
    const transport = httpTransport({
      baseUrl: 'https://sync.example.com/',
      vaultId: 'vault-1',
      token: 't',
      fetch: fetcher,
    })

    await transport.push(request)

    expect(calls[0].url).toBe('https://sync.example.com/vault/vault-1/push')
  })

  it('escapes a vault id that would otherwise change the path', async () => {
    const { calls, fetcher } = stubFetch(() => json({ version: 1 }))
    const transport = httpTransport({
      baseUrl: 'https://sync.example.com',
      vaultId: '../evil',
      token: 't',
      fetch: fetcher,
    })

    await transport.push(request)

    expect(calls[0].url).toBe('https://sync.example.com/vault/..%2Fevil/push')
  })
})

describe('backoffDelay', () => {
  it('retries promptly after a single failure', () => {
    expect(backoffDelay(1)).toBe(2_000)
  })

  it('backs off further with each consecutive failure', () => {
    expect(backoffDelay(2)).toBeGreaterThan(backoffDelay(1))
    expect(backoffDelay(3)).toBeGreaterThan(backoffDelay(2))
  })

  it('stops growing at five minutes so a long outage still recovers quickly', () => {
    expect(backoffDelay(50)).toBe(300_000)
  })

  it('treats a clean run as no delay to make up', () => {
    expect(backoffDelay(0)).toBe(0)
  })
})

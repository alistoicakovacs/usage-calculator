// HTTP transport against the sync worker.
//
// Every failure this cannot fix is classed as either `unauthorized` — the
// vault rejected us, retrying will not help — or `network`, meaning "try again
// later". Server errors and unreadable bodies count as network failures: a
// gateway having a bad day is not a reason to stop syncing forever.
import type { PullResult, PushRequest, PushResult, StoredRecord, SyncTransport } from './protocol'

export interface HttpTransportConfig {
  /** Origin of the deployed worker, with or without a trailing slash. */
  baseUrl: string
  vaultId: string
  /** HMAC(vaultKey, vaultId) — proves vault membership without revealing the key. */
  token: string
  fetch?: typeof fetch
}

export function httpTransport(config: HttpTransportConfig): SyncTransport {
  const doFetch = config.fetch ?? globalThis.fetch
  const origin = config.baseUrl.replace(/\/+$/, '')
  const vault = `${origin}/vault/${encodeURIComponent(config.vaultId)}`
  const auth = { authorization: `Bearer ${config.token}` }

  return {
    async pull(since: number): Promise<PullResult> {
      try {
        const response = await doFetch(`${vault}/pull?since=${since}`, { headers: auth })
        if (response.status === 401) return { ok: false, reason: 'unauthorized' }
        if (!response.ok) return { ok: false, reason: 'network' }

        const body = (await response.json()) as { version: number; records: StoredRecord[] }
        return { ok: true, version: body.version, records: body.records }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },

    async push(request: PushRequest): Promise<PushResult> {
      try {
        const response = await doFetch(`${vault}/push`, {
          method: 'POST',
          headers: { ...auth, 'content-type': 'application/json' },
          body: JSON.stringify(request),
        })
        if (response.status === 401) return { ok: false, reason: 'unauthorized' }

        if (response.status === 409) {
          const body = (await response.json()) as { version: number; records: StoredRecord[] }
          return { ok: false, reason: 'stale', version: body.version, records: body.records }
        }
        if (!response.ok) return { ok: false, reason: 'network' }

        const body = (await response.json()) as { version: number }
        return { ok: true, version: body.version }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },
  }
}

const FIRST_RETRY_MS = 2_000
const MAX_RETRY_MS = 300_000

/**
 * How long to wait before the next attempt, given how many rounds have failed
 * back to back. Doubles up to five minutes: long enough not to hammer a server
 * that is down, short enough that a device left alone overnight is current
 * again within minutes of the network returning.
 */
export function backoffDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0
  return Math.min(FIRST_RETRY_MS * 2 ** (consecutiveFailures - 1), MAX_RETRY_MS)
}

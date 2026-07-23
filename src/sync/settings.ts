// Where this device syncs to. Per-device and never replicated: two devices in
// the same vault may reach the same worker by different names, and a device
// with no server set simply stays local-only.
import type { AppDatabase } from '../data/db'

const SERVER_URL_KEY = 'syncServerUrl'

export type UrlError = 'malformed' | 'insecure'

export type NormalizedUrl = { ok: true; url: string } | { ok: false; error: UrlError }

/**
 * The bearer token proves vault membership, so it must never travel in the
 * clear. Plain http is refused everywhere except loopback, where there is no
 * wire to sniff and `wrangler dev` lives.
 */
export function normalizeServerUrl(input: string): NormalizedUrl {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'malformed' }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, error: 'malformed' }
  }

  const isLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  if (parsed.protocol === 'http:' && !isLoopback) return { ok: false, error: 'insecure' }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'malformed' }
  }

  return { ok: true, url: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '') }
}

export async function loadServerUrl(db: AppDatabase): Promise<string | undefined> {
  return (await db.localState.get(SERVER_URL_KEY))?.value || undefined
}

export async function saveServerUrl(db: AppDatabase, url: string | undefined): Promise<void> {
  if (url === undefined) {
    await db.localState.delete(SERVER_URL_KEY)
    return
  }
  await db.localState.put({ key: SERVER_URL_KEY, value: url })
}

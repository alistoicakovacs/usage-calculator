// Sync service for the usage calculator.
//
// The server is a dumb, untrusted store. It holds opaque AES-GCM envelopes it
// cannot read, ordered by a per-vault version counter. Its only jobs are to
// keep that counter monotonic, reject writes made against a stale view, and
// make sure one vault's holder cannot touch another's.
//
// One Durable Object per vault gives us serialized writes for free, so the
// counter needs no locking of our own.

export interface Env {
  VAULTS: DurableObjectNamespace
}

/** A record as it travels the wire. `envelope` is ciphertext; we never open it. */
interface WireRecord {
  table: string
  recordId: string
  envelope: { iv: string; ct: string }
}

/** A record as stored, stamped with the vault version that wrote it. */
interface StoredRecord extends WireRecord {
  version: number
}

interface VaultMeta {
  version: number
  /** SHA-256 of the bearer token, so a dump of our storage is not a key ring. */
  tokenHash: string
}

const META_KEY = 'meta'
const RECORD_PREFIX = 'rec:'

const ROUTE = /^\/vault\/([^/]+)\/(push|pull)$/

/**
 * Wide-open CORS, deliberately. Access is proven by a bearer token the app
 * holds, never by a cookie the browser would attach on its own, so there is no
 * ambient authority for another origin to abuse — and anyone self-hosting the
 * app gets a working sync endpoint without recompiling the worker. Credentials
 * must stay off for exactly the same reason.
 */
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const { pathname } = new URL(request.url)
    const match = ROUTE.exec(pathname)
    if (!match) return json({ error: 'not-found' }, 404)

    const stub = env.VAULTS.get(env.VAULTS.idFromName(match[1]))
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>

export class VaultDurableObject {
  readonly #state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.#state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const action = ROUTE.exec(url.pathname)?.[2]

    const token = bearerToken(request)
    if (!token) return json({ error: 'unauthorized' }, 401)

    const meta = await this.authorize(token)
    if (!meta) return json({ error: 'unauthorized' }, 401)

    if (action === 'pull' && request.method === 'GET') {
      return this.pull(meta, Number(url.searchParams.get('since') ?? 0))
    }
    if (action === 'push' && request.method === 'POST') {
      return this.push(meta, request)
    }
    return json({ error: 'method-not-allowed' }, 405)
  }

  /**
   * Trust on first use: the first caller to present a token claims the vault,
   * and every later caller must present the same one. Vault ids are random
   * UUIDs never sent to us in the clear by anyone else, and every device
   * derives the identical token from the shared vault key, so legitimate
   * devices always match and a guesser has nothing to guess.
   */
  private async authorize(token: string): Promise<VaultMeta | undefined> {
    const tokenHash = await sha256Hex(token)
    const meta = await this.#state.storage.get<VaultMeta>(META_KEY)
    if (!meta) return { version: 0, tokenHash }
    return timingSafeEqual(meta.tokenHash, tokenHash) ? meta : undefined
  }

  private async pull(meta: VaultMeta, since: number): Promise<Response> {
    return json({ version: meta.version, records: await this.recordsSince(since) })
  }

  private async push(meta: VaultMeta, request: Request): Promise<Response> {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'malformed-body' }, 400)
    }
    if (!isPushBody(body)) return json({ error: 'malformed-body' }, 400)

    // The client wrote these records against `baseVersion`. If the vault has
    // moved on since, it has not seen everything it is about to overwrite —
    // hand back what it missed and let it merge before trying again.
    if (body.baseVersion < meta.version) {
      return json(
        { version: meta.version, records: await this.recordsSince(body.baseVersion) },
        409,
      )
    }

    const version = meta.version + 1
    const writes: Record<string, StoredRecord> = {}
    for (const record of body.records) {
      writes[recordKey(record)] = { ...record, version }
    }
    await this.#state.storage.put(writes)
    await this.#state.storage.put(META_KEY, { ...meta, version })

    return json({ version })
  }

  private async recordsSince(since: number): Promise<StoredRecord[]> {
    const stored = await this.#state.storage.list<StoredRecord>({ prefix: RECORD_PREFIX })
    return [...stored.values()].filter((record) => record.version > since)
  }
}

function recordKey(record: WireRecord): string {
  return `${RECORD_PREFIX}${record.table}:${record.recordId}`
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  return token || undefined
}

interface PushBody {
  baseVersion: number
  records: WireRecord[]
}

/**
 * Shape-checks the body only. The envelope halves must be strings because we
 * store them, but we never look inside: an envelope we cannot decode is still
 * a perfectly good envelope, and deciding otherwise would mean claiming to
 * understand ciphertext we have no key for.
 */
function isPushBody(body: unknown): body is PushBody {
  if (typeof body !== 'object' || body === null) return false
  const { baseVersion, records } = body as Record<string, unknown>
  if (typeof baseVersion !== 'number' || !Number.isInteger(baseVersion) || baseVersion < 0) {
    return false
  }
  return Array.isArray(records) && records.every(isWireRecord)
}

function isWireRecord(value: unknown): value is WireRecord {
  if (typeof value !== 'object' || value === null) return false
  const { table, recordId, envelope } = value as Record<string, unknown>
  if (typeof table !== 'string' || !table || typeof recordId !== 'string' || !recordId) return false
  if (typeof envelope !== 'object' || envelope === null) return false
  const { iv, ct } = envelope as Record<string, unknown>
  return typeof iv === 'string' && typeof ct === 'string'
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compares two equal-length hex digests without an early return. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  })
}

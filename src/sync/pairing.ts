// Pairing links.
//
// The QR code holds an ordinary link to this very app, so the second device
// can scan it with its own camera app and land on the pairing screen already
// filled in — no QR decoder to ship, no camera permission to ask for.
//
// The vault id and recovery key ride in the URL fragment. Fragments are never
// sent to a server, so scanning does not hand the key to whoever hosts the
// app. It does land in that device's history, which is why the pairing screen
// says out loud that this link is as sensitive as the key itself.

export const PAIR_ROUTE = '/pair'

export function buildPairingUrl(appUrl: string, vaultId: string, recoveryKey: string): string {
  const params = new URLSearchParams({ id: vaultId, k: recoveryKey })
  return `${appUrl.split('#')[0]}#${PAIR_ROUTE}?${params.toString()}`
}

export interface PairingPayload {
  vaultId: string
  recoveryKey: string
}

export function parsePairingHash(hash: string): PairingPayload | undefined {
  const withoutMarker = hash.startsWith('#') ? hash.slice(1) : hash
  const [route, query] = withoutMarker.split('?')
  if (route !== PAIR_ROUTE || !query) return undefined

  const params = new URLSearchParams(query)
  const vaultId = params.get('id')
  const recoveryKey = params.get('k')
  if (!vaultId || !recoveryKey) return undefined

  return { vaultId, recoveryKey }
}

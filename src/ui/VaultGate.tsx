// Gates the app behind a create-or-restore first-run screen, and handles the
// pairing links a second device scans.
import { useEffect, useState } from 'react'
import { getDb, type AppDatabase } from '../data/db'
import { createVault, loadVault, restoreVault, type Vault } from '../crypto/vault'
import { parsePairingHash } from '../sync/pairing'
import { normalizeServerUrl, saveServerUrl } from '../sync/settings'
import { VaultProvider } from './VaultContext'

type Phase =
  | { kind: 'loading' }
  | { kind: 'first-run' }
  | { kind: 'ready'; vault: Vault }

export function VaultGate({
  children,
  db = getDb(),
}: {
  children: React.ReactNode
  db?: AppDatabase
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function open(): Promise<Phase> {
      // An existing vault always wins. A pairing link must never be able to
      // swap out the vault a device already holds data for.
      const existing = await loadVault(db)
      if (existing) return { kind: 'ready', vault: existing }

      const payload = parsePairingHash(window.location.hash)
      if (!payload) return { kind: 'first-run' }

      const restored = await restoreVault(db, payload.vaultId, payload.recoveryKey)
      if (!restored.ok) return { kind: 'first-run' }

      // A scanned code is not a trusted source, so the server it names goes
      // through the same check as one typed by hand. A rejected one simply
      // leaves the device local-only rather than failing the pairing.
      if (payload.serverUrl) {
        const server = normalizeServerUrl(payload.serverUrl)
        if (server.ok) await saveServerUrl(db, server.url)
      }

      forgetPairingLink()
      return { kind: 'ready', vault: restored.vault }
    }

    void open().then((next) => {
      if (!cancelled) setPhase(next)
    })
    return () => {
      cancelled = true
    }
  }, [db])

  if (phase.kind === 'loading') {
    return <div className="app-shell" style={{ padding: '2rem' }} />
  }

  if (phase.kind === 'first-run') {
    return <FirstRunScreen db={db} onReady={(vault) => setPhase({ kind: 'ready', vault })} />
  }

  return <VaultProvider vault={phase.vault}>{children}</VaultProvider>
}

/**
 * Strip the pairing payload from the address bar as soon as the key is safely
 * stored, so it does not linger in the URL or in a screenshot.
 */
function forgetPairingLink(): void {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

function FirstRunScreen({
  db,
  onReady,
}: {
  db: AppDatabase
  onReady: (vault: Vault) => void
}) {
  const [mode, setMode] = useState<'choose' | 'created' | 'restore'>('choose')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [restoreId, setRestoreId] = useState('')
  const [restoreKey, setRestoreKey] = useState('')
  const [error, setError] = useState<string>()
  const [pendingVault, setPendingVault] = useState<Vault>()

  async function create() {
    const { vault, recoveryKey } = await createVault(db)
    setPendingVault(vault)
    setRecoveryKey(recoveryKey)
    setMode('created')
  }

  async function restore() {
    const result = await restoreVault(db, restoreId.trim(), restoreKey)
    if (!result.ok) {
      setError('Ungültiger Wiederherstellungsschlüssel oder Tresor-ID.')
      return
    }
    onReady(result.vault)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Zählerstand</h1>
      </header>

      {mode === 'choose' && (
        <>
          <section className="card">
            <h2 className="card-title">Willkommen</h2>
            <p style={{ marginTop: 0, color: 'var(--text-dim)' }}>
              Ihre Daten werden verschlüsselt und nur auf Ihren Geräten gespeichert. Legen Sie
              einen Tresor an oder stellen Sie einen bestehenden wieder her.
            </p>
            <button className="btn" onClick={() => void create()}>
              Neuen Tresor anlegen
            </button>
            <div className="btn-row">
              <button className="btn secondary" onClick={() => setMode('restore')}>
                Bestehenden Tresor wiederherstellen
              </button>
            </div>
          </section>
        </>
      )}

      {mode === 'created' && (
        <section className="card">
          <h2 className="card-title">Wiederherstellungsschlüssel</h2>
          <div className="warning-box">
            Notieren Sie diesen Schlüssel und bewahren Sie ihn sicher auf. Er ist der{' '}
            <strong>einzige Weg</strong>, Ihre Daten auf einem neuen Gerät wiederherzustellen.
            Ohne ihn und ohne ein gekoppeltes Gerät sind die Daten unwiderruflich verloren.
          </div>
          <p
            style={{
              fontFamily: 'ui-monospace, Consolas, monospace',
              fontSize: '1rem',
              wordBreak: 'break-all',
              background: 'var(--surface-2)',
              padding: '0.75rem',
              borderRadius: '8px',
            }}
          >
            {recoveryKey}
          </p>
          <button
            className="btn secondary"
            onClick={() => void navigator.clipboard?.writeText(recoveryKey)}
          >
            Kopieren
          </button>
          <button
            className="btn"
            style={{ marginTop: '0.6rem' }}
            onClick={() => pendingVault && onReady(pendingVault)}
          >
            Ich habe den Schlüssel gesichert
          </button>
        </section>
      )}

      {mode === 'restore' && (
        <section className="card">
          <h2 className="card-title">Tresor wiederherstellen</h2>
          <div className="form-field">
            <label>
              Tresor-ID
              <input
                value={restoreId}
                onChange={(e) => {
                  setRestoreId(e.target.value)
                  setError(undefined)
                }}
                placeholder="aus dem QR-Code / anderen Gerät"
              />
            </label>
          </div>
          <div className="form-field">
            <label>
              Wiederherstellungsschlüssel
              <input
                value={restoreKey}
                onChange={(e) => {
                  setRestoreKey(e.target.value)
                  setError(undefined)
                }}
                placeholder="XXXXX-XXXXX-..."
              />
            </label>
            {error && <span className="error">{error}</span>}
          </div>
          <button className="btn" onClick={() => void restore()}>
            Wiederherstellen
          </button>
          <div className="btn-row">
            <button className="btn secondary" onClick={() => setMode('choose')}>
              Zurück
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

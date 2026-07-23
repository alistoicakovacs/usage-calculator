// Vault context: exposes the current vault (id + key) to the app once created
// or restored. Gates the app behind a create-or-restore first-run screen.
import { createContext, useContext, useEffect, useState } from 'react'
import { getDb } from '../data/db'
import { createVault, loadVault, restoreVault, type Vault } from '../crypto/vault'

interface VaultContextValue {
  vault: Vault
}

const VaultCtx = createContext<VaultContextValue | undefined>(undefined)

export function useVault(): Vault {
  const ctx = useContext(VaultCtx)
  if (!ctx) throw new Error('useVault must be used inside VaultGate')
  return ctx.vault
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'first-run' }
  | { kind: 'ready'; vault: Vault }

export function VaultGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    void loadVault(getDb()).then((vault) => {
      setPhase(vault ? { kind: 'ready', vault } : { kind: 'first-run' })
    })
  }, [])

  if (phase.kind === 'loading') {
    return <div className="app-shell" style={{ padding: '2rem' }} />
  }

  if (phase.kind === 'first-run') {
    return <FirstRunScreen onReady={(vault) => setPhase({ kind: 'ready', vault })} />
  }

  return <VaultCtx.Provider value={{ vault: phase.vault }}>{children}</VaultCtx.Provider>
}

function FirstRunScreen({ onReady }: { onReady: (vault: Vault) => void }) {
  const [mode, setMode] = useState<'choose' | 'created' | 'restore'>('choose')
  const [recoveryKey, setRecoveryKey] = useState('')
  const [restoreId, setRestoreId] = useState('')
  const [restoreKey, setRestoreKey] = useState('')
  const [error, setError] = useState<string>()
  const [pendingVault, setPendingVault] = useState<Vault>()

  async function create() {
    const { vault, recoveryKey } = await createVault(getDb())
    setPendingVault(vault)
    setRecoveryKey(recoveryKey)
    setMode('created')
  }

  async function restore() {
    const result = await restoreVault(getDb(), restoreId.trim(), restoreKey)
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

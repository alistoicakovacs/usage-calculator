// Gates the app behind a friendly first-run flow, and handles the pairing
// links a second device scans. The gate logic (an existing vault always wins;
// a pairing link restores rather than replaces) is unchanged from before — only
// the first-run presentation is now a guided stepper.
import { useState } from 'react'
import { getDb, type AppDatabase } from '../data/db'
import { createVault, loadVault, restoreVault, type Vault } from '../crypto/vault'
import { parsePairingHash } from '../sync/pairing'
import { normalizeServerUrl, saveServerUrl } from '../sync/settings'
import { useEffect } from 'react'
import { GradientText, Stepper, Step } from './reactbits'
import { VaultProvider } from './VaultContext'

type Phase = { kind: 'loading' } | { kind: 'first-run' } | { kind: 'ready'; vault: Vault }

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
      // through the same check as one typed by hand.
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

type Mode = 'welcome' | 'create' | 'restore'

function FirstRunScreen({ db, onReady }: { db: AppDatabase; onReady: (vault: Vault) => void }) {
  const [mode, setMode] = useState<Mode>('welcome')

  if (mode === 'create') return <CreateFlow db={db} onReady={onReady} onBack={() => setMode('welcome')} />
  if (mode === 'restore') return <RestoreFlow db={db} onReady={onReady} onBack={() => setMode('welcome')} />

  return (
    <div className="onboard">
      <div className="brand">
        <GradientText colors={['#38bdf8', '#818cf8', '#38bdf8']}>
          <span style={{ fontSize: '1.9rem', fontWeight: 750 }}>Zählerstand</span>
        </GradientText>
        <p style={{ color: 'var(--text-dim)', marginTop: '0.4rem' }}>
          Strom, Gas und Wasser im Blick — mit Prognose zur Jahresabrechnung.
        </p>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <p style={{ marginTop: 0, color: 'var(--text-dim)' }}>
          Ihre Daten werden verschlüsselt und ausschließlich auf Ihren Geräten gespeichert.
          Richten Sie einen Tresor ein, um zu beginnen.
        </p>
        <button className="btn" onClick={() => setMode('create')}>
          Einrichten
        </button>
        <div className="btn-row">
          <button className="btn secondary" onClick={() => setMode('restore')}>
            Bestehenden Tresor wiederherstellen
          </button>
        </div>
      </div>
    </div>
  )
}

/** Guided create flow. The vault is created up front so the recovery key is
 *  ready to show; the user must acknowledge saving it before finishing. */
function CreateFlow({
  db,
  onReady,
  onBack,
}: {
  db: AppDatabase
  onReady: (vault: Vault) => void
  onBack: () => void
}) {
  const [vault, setVault] = useState<Vault>()
  const [recoveryKey, setRecoveryKey] = useState('')
  const [ack, setAck] = useState(false)
  const [step, setStep] = useState(1)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    void createVault(db).then((res) => {
      if (cancelled) return
      setVault(res.vault)
      setRecoveryKey(res.recoveryKey)
    })
    return () => {
      cancelled = true
    }
  }, [db])

  // The recovery-key step (3) gates progress until acknowledged.
  const nextDisabled = step === 3 && !ack

  return (
    <div className="onboard">
      <div className="brand">
        <GradientText colors={['#38bdf8', '#818cf8', '#38bdf8']}>
          <span style={{ fontSize: '1.5rem', fontWeight: 750 }}>Zählerstand einrichten</span>
        </GradientText>
      </div>

      <Stepper
        onStepChange={setStep}
        onFinalStepCompleted={() => vault && onReady(vault)}
        backButtonText="Zurück"
        nextButtonText="Weiter"
        nextButtonProps={{ disabled: nextDisabled }}
      >
        <Step>
          <div className="step-body">
            <h2>Willkommen 👋</h2>
            <p>
              Sie erfassen Ihre Zählerstände selbst — die App berechnet daraus den Verbrauch,
              die Kosten und eine Prognose, ob Sie am Jahresende ein Guthaben erhalten oder
              nachzahlen müssen.
            </p>
          </div>
        </Step>

        <Step>
          <div className="step-body">
            <h2>So funktioniert&#39;s</h2>
            <p>
              <strong>1. Erfassen</strong> — Zählerstand ablesen und eintragen.
              <br />
              <strong>2. Prognose</strong> — Verbrauch &amp; voraussichtliche Kosten sehen.
              <br />
              <strong>3. Abrechnung</strong> — Guthaben oder Nachzahlung abschätzen.
            </p>
            <p>Alles bleibt verschlüsselt auf Ihren Geräten.</p>
          </div>
        </Step>

        <Step>
          <div className="step-body">
            <h2>Wiederherstellungsschlüssel</h2>
            <div className="warning-box">
              Notieren Sie diesen Schlüssel und bewahren Sie ihn sicher auf. Er ist der{' '}
              <strong>einzige Weg</strong>, Ihre Daten auf einem neuen Gerät wiederherzustellen.
              Ohne ihn und ohne ein gekoppeltes Gerät sind die Daten unwiderruflich verloren.
            </div>
            <div className="mono-block">{recoveryKey || '…'}</div>
            <button
              className="btn secondary"
              disabled={!recoveryKey}
              onClick={() => {
                void navigator.clipboard?.writeText(recoveryKey)
                setCopied(true)
              }}
            >
              {copied ? 'Kopiert ✓' : 'Kopieren'}
            </button>
            <label
              className="choice-group"
              style={{ marginTop: '0.75rem', display: 'block' }}
            >
              <label>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>Ich habe den Schlüssel sicher gespeichert.</span>
              </label>
            </label>
          </div>
        </Step>

        <Step>
          <div className="step-body">
            <h2>Alles bereit 🎉</h2>
            <p>
              Ihr Tresor ist eingerichtet. Legen Sie als Nächstes eine Immobilie und Ihre Zähler
              an, um den ersten Stand zu erfassen.
            </p>
          </div>
        </Step>
      </Stepper>

      <button className="btn ghost" style={{ marginTop: '0.75rem' }} onClick={onBack}>
        Abbrechen
      </button>
    </div>
  )
}

function RestoreFlow({
  db,
  onReady,
  onBack,
}: {
  db: AppDatabase
  onReady: (vault: Vault) => void
  onBack: () => void
}) {
  const [restoreId, setRestoreId] = useState('')
  const [restoreKey, setRestoreKey] = useState('')
  const [error, setError] = useState<string>()

  async function restore() {
    const result = await restoreVault(db, restoreId.trim(), restoreKey)
    if (!result.ok) {
      setError('Ungültiger Wiederherstellungsschlüssel oder Tresor-ID.')
      return
    }
    onReady(result.vault)
  }

  return (
    <div className="onboard">
      <div className="brand">
        <span style={{ fontSize: '1.5rem', fontWeight: 750 }}>Tresor wiederherstellen</span>
      </div>
      <div className="card">
        <div className="form-field">
          <label>
            <span>Tresor-ID</span>
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
            <span>Wiederherstellungsschlüssel</span>
            <input
              value={restoreKey}
              onChange={(e) => {
                setRestoreKey(e.target.value)
                setError(undefined)
              }}
              placeholder="XXXXX-XXXXX-…"
            />
          </label>
          {error && <span className="error">{error}</span>}
        </div>
        <button className="btn" onClick={() => void restore()}>
          Wiederherstellen
        </button>
        <div className="btn-row">
          <button className="btn secondary" onClick={onBack}>
            Zurück
          </button>
        </div>
      </div>
    </div>
  )
}

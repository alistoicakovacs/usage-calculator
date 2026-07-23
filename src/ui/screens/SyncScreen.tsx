// Sync setup: where this device syncs to, how it is doing, and how to bring a
// second device into the vault.
//
// The pairing code stays hidden until asked for. It carries the vault key, so
// putting it on screen by default would mean anyone glancing over a shoulder
// walks away with the whole vault.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { getRecoveryKey } from '../../crypto/vault'
import { buildPairingUrl } from '../../sync/pairing'
import { loadServerUrl, normalizeServerUrl, saveServerUrl } from '../../sync/settings'
import { Field, Screen } from '../components/common'
import { useRepoContext } from '../AppContext'
import { useSync, type SyncStatus } from '../SyncContext'
import { useVault } from '../VaultContext'

const STATUS_TEXT: Record<SyncStatus, string> = {
  disabled: 'Nur auf diesem Gerät. Kein Sync-Server eingerichtet.',
  idle: 'Aktuell — alle Änderungen sind übertragen.',
  syncing: 'Wird synchronisiert …',
  offline: 'Offline. Ihre Daten sind sicher; die Übertragung wird automatisch wiederholt.',
  unauthorized: 'Vom Server abgelehnt. Prüfen Sie die Adresse des Sync-Servers.',
}

export function SyncScreen() {
  const { db } = useRepoContext()
  const sync = useSync()

  return (
    <Screen title="Synchronisierung" back="/">
      <section className="card">
        <h2 className="card-title">Status</h2>
        <p className={`sync-status ${sync.status}`}>{STATUS_TEXT[sync.status]}</p>

        {sync.conflicts.length > 0 && (
          <Link className="btn danger" style={{ textDecoration: 'none' }} to="/conflicts">
            {sync.conflicts.length} Konflikt{sync.conflicts.length === 1 ? '' : 'e'} lösen
          </Link>
        )}

        <div className="btn-row">
          <button className="btn secondary" onClick={sync.syncNow}>
            Jetzt synchronisieren
          </button>
        </div>
      </section>

      <ServerSection db={db} />
      <PairingSection />
    </Screen>
  )
}

function ServerSection({ db }: { db: ReturnType<typeof useRepoContext>['db'] }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void loadServerUrl(db).then((stored) => setUrl(stored ?? ''))
  }, [db])

  function save() {
    setSaved(false)
    if (url.trim() === '') {
      setError(undefined)
      void saveServerUrl(db, undefined).then(() => setSaved(true))
      return
    }

    const normalized = normalizeServerUrl(url)
    if (!normalized.ok) {
      setError(
        normalized.error === 'insecure'
          ? 'Nur https ist erlaubt — sonst reist der Zugriffsschlüssel unverschlüsselt mit.'
          : 'Ungültige Adresse. Beispiel: https://sync.example.workers.dev',
      )
      return
    }

    setError(undefined)
    setUrl(normalized.url)
    void saveServerUrl(db, normalized.url).then(() => setSaved(true))
  }

  return (
    <section className="card">
      <h2 className="card-title">Sync-Server</h2>
      <p className="hint">
        Der Server speichert ausschließlich verschlüsselte Daten und kann sie nicht lesen. Ohne
        Eintrag bleiben alle Daten lokal.
      </p>
      <Field label="Sync-Server" error={error}>
        <input
          value={url}
          inputMode="url"
          placeholder="https://…"
          onChange={(event) => {
            setUrl(event.target.value)
            setError(undefined)
            setSaved(false)
          }}
        />
      </Field>
      <button className="btn" onClick={save}>
        Speichern
      </button>
      {saved && <p className="hint">Gespeichert.</p>}
    </section>
  )
}

function PairingSection() {
  const vault = useVault()
  const [revealed, setRevealed] = useState(false)
  const [recoveryKey, setRecoveryKey] = useState<string>()
  const [qr, setQr] = useState<string>()

  useEffect(() => {
    if (!revealed) {
      setRecoveryKey(undefined)
      setQr(undefined)
      return
    }
    let cancelled = false
    void getRecoveryKey(vault).then(async (key) => {
      const url = buildPairingUrl(window.location.href, vault.id, key)
      const svg = await QRCode.toString(url, { type: 'svg', margin: 1 })
      if (cancelled) return
      setRecoveryKey(key)
      setQr(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
    })
    return () => {
      cancelled = true
    }
  }, [revealed, vault])

  return (
    <section className="card">
      <h2 className="card-title">Weiteres Gerät</h2>

      {!revealed && (
        <>
          <p className="hint">
            Zeigt einen Kopplungscode, den das zweite Gerät mit seiner Kamera scannen kann.
          </p>
          <button className="btn" onClick={() => setRevealed(true)}>
            Gerät koppeln
          </button>
        </>
      )}

      {revealed && (
        <>
          <div className="warning-box">
            Dieser Code gewährt <strong>vollen Zugriff</strong> auf alle Ihre Daten. Zeigen Sie ihn
            nur Ihrem eigenen Gerät und nie in der Öffentlichkeit.
          </div>

          {qr && <img className="pairing-qr" src={qr} alt="Kopplungscode" />}

          {recoveryKey && (
            <>
              <p className="hint">Oder von Hand eingeben:</p>
              <p className="mono-block">{vault.id}</p>
              <p className="mono-block">{recoveryKey}</p>
            </>
          )}

          <div className="btn-row">
            <button className="btn secondary" onClick={() => setRevealed(false)}>
              Verbergen
            </button>
          </div>
        </>
      )}
    </section>
  )
}

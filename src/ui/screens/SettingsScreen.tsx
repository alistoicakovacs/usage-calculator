// Settings hub: appearance, synchronisation, and security in one place.
//
// This folds the old standalone SyncScreen into a tab of the settings page and
// adds a theme control. Every sync/pairing behaviour is preserved as it was:
// the server URL is normalised before it is stored, the pairing code stays
// hidden until asked for (it carries the vault key, so showing it by default
// would leak the whole vault to anyone glancing at the screen), and the QR is
// an ordinary deep link into this very app.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { getRecoveryKey } from '../../crypto/vault'
import { buildPairingUrl } from '../../sync/pairing'
import { loadServerUrl, normalizeServerUrl, saveServerUrl } from '../../sync/settings'
import { Field, Screen } from '../components/common'
import { useAsyncData, useRepoContext } from '../AppContext'
import { useSync, type SyncStatus } from '../SyncContext'
import { useVault } from '../VaultContext'
import { useTheme, type ThemePref } from '../theme'

const STATUS_LABEL: Record<SyncStatus, string> = {
  disabled: 'Lokal',
  idle: 'Aktuell',
  syncing: 'Synchronisiert …',
  offline: 'Offline',
  unauthorized: 'Nicht autorisiert',
}

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
]

export function SettingsScreen() {
  const { db } = useRepoContext()

  return (
    <Screen title="Mehr">
      <AppearanceSection />
      <SyncSection db={db} />
      <SecuritySection />
    </Screen>
  )
}

function AppearanceSection() {
  const { pref, setPref } = useTheme()

  return (
    <section className="card">
      <h2 className="card-title">Darstellung</h2>
      <div className="segmented">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={pref === option.value ? 'active' : undefined}
            onClick={() => setPref(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function SyncSection({ db }: { db: ReturnType<typeof useRepoContext>['db'] }) {
  const sync = useSync()

  const loaded = useAsyncData(() => loadServerUrl(db).then((stored) => stored ?? ''), [db])
  const [url, setUrl] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (loaded.data !== undefined && !hydrated) {
      setUrl(loaded.data)
      setHydrated(true)
    }
  }, [loaded.data, hydrated])

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
      <h2 className="card-title">Synchronisierung</h2>

      <p className={`status-pill ${sync.status}`}>{STATUS_LABEL[sync.status]}</p>

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
      <button className="btn secondary" onClick={save}>
        Speichern
      </button>
      {saved && <p className="hint">Gespeichert.</p>}

      <div className="btn-row">
        <button className="btn" onClick={sync.syncNow}>
          Jetzt synchronisieren
        </button>
      </div>

      {sync.conflicts.length > 0 && (
        <Link className="callout" style={{ textDecoration: 'none' }} to="/conflicts">
          <span className="c-icon">⚠️</span>
          <span>
            {sync.conflicts.length} Konflikt{sync.conflicts.length === 1 ? '' : 'e'} lösen
          </span>
        </Link>
      )}

      <PairingBlock db={db} />
    </section>
  )
}

function PairingBlock({ db }: { db: ReturnType<typeof useRepoContext>['db'] }) {
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
      // Hand the second device our server too, so it needs no setup at all.
      const serverUrl = await loadServerUrl(db)
      const url = buildPairingUrl(window.location.href, vault.id, key, serverUrl)
      const svg = await QRCode.toString(url, { type: 'svg', margin: 1 })
      if (cancelled) return
      setRecoveryKey(key)
      setQr(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`)
    })
    return () => {
      cancelled = true
    }
  }, [revealed, vault, db])

  if (!revealed) {
    return (
      <>
        <p className="hint">
          Zeigt einen Kopplungscode, den das zweite Gerät mit seiner Kamera scannen kann.
        </p>
        <button className="btn secondary" onClick={() => setRevealed(true)}>
          Gerät koppeln
        </button>
      </>
    )
  }

  return (
    <>
      <div className="warning-box">
        Dieser Code gewährt <strong>vollen Zugriff</strong> auf alle Ihre Daten. Zeigen Sie ihn nur
        Ihrem eigenen Gerät und nie in der Öffentlichkeit.
      </div>

      {qr && <img className="pairing-qr" src={qr} alt="Kopplungscode" />}

      {recoveryKey && (
        <>
          <p className="hint">Oder von Hand eingeben — Tresor-ID und Wiederherstellungsschlüssel:</p>
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
  )
}

function SecuritySection() {
  const vault = useVault()

  return (
    <section className="card">
      <h2 className="card-title">Sicherheit</h2>
      <p className="hint">Tresor-ID dieses Geräts:</p>
      <p className="mono-block">{vault.id}</p>
      <p className="hint">
        Der Wiederherstellungsschlüssel ist der einzige Weg, Ihre Daten auf einem neuen Gerät
        wiederherzustellen. Bewahren Sie ihn sicher auf.
      </p>
    </section>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useOptionalSync, type SyncContextValue } from '../SyncContext'
import './ui.css'

export function Screen({
  title,
  back,
  children,
}: {
  title: string
  back?: string
  children: React.ReactNode
}) {
  const sync = useOptionalSync()

  return (
    <div className="app-shell">
      <header className="app-header">
        {back !== undefined && (
          <Link className="back-link" to={back} aria-label="Zurück">
            ‹
          </Link>
        )}
        <h1>{title}</h1>
        {sync && <SyncIndicator sync={sync} />}
      </header>
      {children}
    </div>
  )
}

/**
 * Sync is meant to be forgettable, so this stays a single quiet marker — until
 * something needs the user, which is only ever an unsettled conflict.
 */
function SyncIndicator({ sync }: { sync: SyncContextValue }) {
  if (sync.conflicts.length > 0) {
    const count = sync.conflicts.length
    return (
      <Link className="sync-indicator conflicts" to="/conflicts">
        {count} Konflikt{count === 1 ? '' : 'e'}
      </Link>
    )
  }

  return (
    <Link className={`sync-indicator ${sync.status}`} to="/sync" title="Synchronisierung">
      {sync.status === 'offline' ? 'Offline' : 'Synchronisierung'}
    </Link>
  )
}

export function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="form-field">
      <label>
        {label}
        {children}
      </label>
      {error !== undefined && <span className="error">{error}</span>}
    </div>
  )
}

export function EstimateTag() {
  return <span className="estimate-tag">geschätzt</span>
}

/**
 * A destructive button that requires a second confirming click.
 * The first click reveals the confirm/cancel choice inline.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
}: {
  label: string
  confirmLabel: string
  onConfirm: () => void
}) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <button className="btn danger" onClick={() => setArmed(true)}>
        {label}
      </button>
    )
  }
  return (
    <div className="btn-row">
      <button className="btn danger" onClick={onConfirm}>
        {confirmLabel}
      </button>
      <button className="btn secondary" onClick={() => setArmed(false)}>
        Abbrechen
      </button>
    </div>
  )
}

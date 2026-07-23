import { useState } from 'react'
import { Link } from 'react-router-dom'
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
  return (
    <div className="app-shell">
      <header className="app-header">
        {back !== undefined && (
          <Link className="back-link" to={back} aria-label="Zurück">
            ‹
          </Link>
        )}
        <h1>{title}</h1>
      </header>
      {children}
    </div>
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

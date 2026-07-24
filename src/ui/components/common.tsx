import { useState } from 'react'
import { Link } from 'react-router-dom'
import './ui.css'

/**
 * Page shell: a sticky header with an optional back link and an optional
 * right-aligned action slot. Sync moved out of the header into Settings;
 * navigation now lives in the persistent bottom tab bar.
 */
export function Screen({
  title,
  back,
  action,
  children,
}: {
  title: string
  back?: string
  action?: React.ReactNode
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
        {action}
      </header>
      {children}
    </div>
  )
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="form-field">
      <label>
        <span>{label}</span>
        {children}
      </label>
      {hint !== undefined && <span className="field-hint">{hint}</span>}
      {error !== undefined && <span className="error">{error}</span>}
    </div>
  )
}

export function EstimateTag() {
  return <span className="estimate-tag">geschätzt</span>
}

/** Balance/status chip. */
export function Chip({
  tone,
  children,
}: {
  tone: 'positive' | 'negative' | 'neutral'
  children: React.ReactNode
}) {
  return <span className={`chip ${tone}`}>{children}</span>
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

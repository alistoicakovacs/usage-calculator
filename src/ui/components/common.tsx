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

export function meterIcon(kind: 'electricity' | 'gas' | 'water'): string {
  return kind === 'electricity' ? '⚡' : kind === 'gas' ? '🔥' : '💧'
}

export function meterKindLabel(kind: 'electricity' | 'gas' | 'water'): string {
  return kind === 'electricity' ? 'Strom' : kind === 'gas' ? 'Gas' : 'Wasser'
}

export function meterUnit(kind: 'electricity' | 'gas' | 'water'): string {
  return kind === 'electricity' ? 'kWh' : 'm³'
}

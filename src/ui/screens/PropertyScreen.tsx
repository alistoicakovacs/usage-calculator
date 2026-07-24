// Property detail: meters list with per-meter forecast, inline add-meter,
// edit and delete of the property.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import { meterRepo, propertyRepo } from '../../data/repos'
import {
  isConfigured,
  lastReading,
  loadBundlesForProperty,
  meterForecast,
  todayIso,
} from '../data'
import { formatDateDe } from '../../domain/dates'
import { formatEuro, formatGermanDecimal } from '../../domain/parse'
import { dec, roundMoney } from '../../domain/decimal'
import { Chip, ConfirmButton, EstimateTag, Field, Screen } from '../components/common'
import { meterIcon, meterKindLabel, meterUnit } from '../components/meters'
import type { MeterKind } from '../../domain/types'

function kindAccent(kind: MeterKind): string {
  return kind === 'electricity' ? 'elec' : kind === 'gas' ? 'gas' : 'water'
}

export function PropertyScreen() {
  const ctx = useRepoContext()
  const navigate = useNavigate()
  const { propertyId } = useParams()
  const [showAddMeter, setShowAddMeter] = useState(false)
  const [meterLabel, setMeterLabel] = useState('')
  const [meterKind, setMeterKind] = useState<MeterKind>('electricity')

  const { data, refresh } = useAsyncData(async () => {
    if (!propertyId) return undefined
    const property = await propertyRepo.get(ctx, propertyId)
    if (!property) return undefined
    const bundles = await loadBundlesForProperty(ctx, propertyId)
    return { property, bundles }
  }, [propertyId])

  if (data === undefined) return <Screen title="Objekt" back="/properties">{null}</Screen>
  const { property, bundles } = data
  const today = todayIso(ctx)

  async function addMeter() {
    if (!propertyId) return
    await meterRepo.save(ctx, {
      propertyId,
      label: meterLabel.trim(),
      kind: meterKind,
    })
    setShowAddMeter(false)
    setMeterLabel('')
    setMeterKind('electricity')
    refresh()
  }

  return (
    <Screen
      title={property.label || property.postalCode}
      back="/properties"
      action={
        <Link
          to={`/property/${property.id}/edit`}
          style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          Bearbeiten
        </Link>
      }
    >
      {bundles.length === 0 && (
        <p className="empty-state" style={{ padding: '0.75rem' }}>
          Noch keine Zähler für diese Immobilie.
        </p>
      )}

      {bundles.map((b) => {
        const last = lastReading(b)
        const unit = meterUnit(b.meter.kind)
        const forecast = isConfigured(b) ? meterForecast(b, today) : undefined
        const showForecast = forecast !== undefined && !forecast.insufficientData
        return (
          <button
            key={b.meter.id}
            className="action-card"
            onClick={() => navigate(`/meter/${b.meter.id}`)}
          >
            <span className={`icon ${kindAccent(b.meter.kind)}`}>{meterIcon(b.meter.kind)}</span>
            <span className="body">
              <span className="label">{b.meter.label || meterKindLabel(b.meter.kind)}</span>
              <br />
              <span className="sub">
                {last
                  ? `Letzter Stand: ${formatGermanDecimal(dec(last.value))} ${unit} am ${formatDateDe(last.date)}`
                  : 'Noch kein Stand'}
              </span>
            </span>
            {showForecast && (
              <span className="trailing">
                <Chip tone={forecast.balance.gte(0) ? 'positive' : 'negative'}>
                  {forecast.balance.gte(0) ? 'Guthaben ' : 'Nachzahlung '}
                  {formatEuro(roundMoney(forecast.balance.abs()))}
                </Chip>
                <EstimateTag />
              </span>
            )}
            <span className="chevron">›</span>
          </button>
        )
      })}

      {showAddMeter ? (
        <div className="card">
          <h2 className="card-title">Neuer Zähler</h2>
          <Field label="Art">
            <div className="segmented">
              <button
                className={meterKind === 'electricity' ? 'active' : ''}
                onClick={() => setMeterKind('electricity')}
              >
                ⚡ Strom
              </button>
              <button
                className={meterKind === 'gas' ? 'active' : ''}
                onClick={() => setMeterKind('gas')}
              >
                🔥 Gas
              </button>
              <button
                className={meterKind === 'water' ? 'active' : ''}
                onClick={() => setMeterKind('water')}
              >
                💧 Wasser
              </button>
            </div>
          </Field>
          <Field label="Bezeichnung (optional)">
            <input
              value={meterLabel}
              onChange={(e) => setMeterLabel(e.target.value)}
              placeholder="z. B. Hauptzähler"
            />
          </Field>
          <div className="btn-row">
            <button className="btn" onClick={() => void addMeter()}>
              Anlegen
            </button>
            <button className="btn secondary" onClick={() => setShowAddMeter(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button className="btn secondary" onClick={() => setShowAddMeter(true)}>
          + Zähler hinzufügen
        </button>
      )}

      <div style={{ marginTop: '0.75rem' }}>
        <Link
          to={`/property/${property.id}/edit`}
          style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}
        >
          Immobilie bearbeiten
        </Link>
      </div>

      <section className="card" style={{ marginTop: '0.75rem' }}>
        <h2 className="card-title">Immobilie verwalten</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 0 }}>
          Löschen entfernt die Immobilie samt aller Zähler, Stände und Tarife.
        </p>
        <ConfirmButton
          label="Immobilie löschen"
          confirmLabel="Wirklich löschen"
          onConfirm={() => {
            void propertyRepo.remove(ctx, property.id).then(() => navigate('/properties'))
          }}
        />
      </section>
    </Screen>
  )
}

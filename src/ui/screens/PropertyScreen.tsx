// Property detail: meters list, add meter, forecast per meter.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import {
  billingPeriodRepo,
  gasConversionRepo,
  meterRepo,
  propertyRepo,
  readingRepo,
  tariffRepo,
} from '../../data/repos'
import { forecastBillingPeriod, type Forecast } from '../../domain/forecast'
import { formatEuro } from '../../domain/parse'
import { roundMoney } from '../../domain/decimal'
import { EstimateTag, Field, Screen, meterIcon, meterKindLabel } from '../components/common'
import type { MeterKind } from '../../domain/types'
import type { MeterRow } from '../../data/db'

interface MeterSummary {
  meter: MeterRow
  lastReading?: { date: string; value: string }
  forecast?: Forecast
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
    const meters = await meterRepo.byProperty(ctx, propertyId)
    const summaries: MeterSummary[] = []
    for (const meter of meters) {
      const [readings, tariffs, conversions, billings] = await Promise.all([
        readingRepo.byMeter(ctx, meter.id),
        tariffRepo.byMeter(ctx, meter.id),
        gasConversionRepo.byMeter(ctx, meter.id),
        billingPeriodRepo.byMeter(ctx, meter.id),
      ])
      const last = readings[readings.length - 1]
      const billing = billings[billings.length - 1]
      let forecast: Forecast | undefined
      if (billing && tariffs.length > 0) {
        const f = forecastBillingPeriod(readings, meter.kind, tariffs, billing, conversions)
        if (f.ok) forecast = f.value
      }
      summaries.push({
        meter,
        lastReading: last ? { date: last.date, value: last.value } : undefined,
        forecast,
      })
    }
    return { property, summaries }
  }, [propertyId])

  if (data === undefined) return <Screen title="Immobilie" back="/">{null}</Screen>
  const { property, summaries } = data

  async function addMeter() {
    if (!propertyId) return
    await meterRepo.save(ctx, {
      propertyId,
      label: meterLabel.trim(),
      kind: meterKind,
    })
    setShowAddMeter(false)
    setMeterLabel('')
    refresh()
  }

  return (
    <Screen title={property.label || property.postalCode} back="/">
      {summaries.map(({ meter, lastReading, forecast }) => (
        <section key={meter.id} className="card">
          <h2 className="card-title">
            {meterIcon(meter.kind)} {meter.label || meterKindLabel(meter.kind)}
          </h2>

          {forecast && !forecast.insufficientData && (
            <p style={{ margin: '0 0 0.6rem' }}>
              <span
                className={`balance ${forecast.balance.gte(0) ? 'positive' : 'negative'}`}
              >
                {forecast.balance.gte(0) ? 'Guthaben ' : 'Nachzahlung '}
                {formatEuro(roundMoney(forecast.balance.abs()))}
              </span>
              <EstimateTag />
            </p>
          )}

          {lastReading && (
            <p className="secondary" style={{ color: 'var(--text-dim)', margin: '0 0 0.6rem', fontSize: '0.85rem' }}>
              Letzter Stand: {lastReading.value.replace('.', ',')} am{' '}
              {lastReading.date.split('-').reverse().join('.')}
            </p>
          )}

          <div className="btn-row">
            <button className="btn" onClick={() => navigate(`/meter/${meter.id}/reading/new`)}>
              Stand eintragen
            </button>
            <Link
              className="btn secondary"
              style={{ textAlign: 'center', textDecoration: 'none' }}
              to={`/meter/${meter.id}`}
            >
              Details
            </Link>
          </div>
        </section>
      ))}

      {showAddMeter ? (
        <div className="card">
          <h2 className="card-title">Neuer Zähler</h2>
          <Field label="Art">
            <select value={meterKind} onChange={(e) => setMeterKind(e.target.value as MeterKind)}>
              <option value="electricity">Strom (kWh)</option>
              <option value="gas">Gas (m³)</option>
              <option value="water">Wasser (m³)</option>
            </select>
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
    </Screen>
  )
}

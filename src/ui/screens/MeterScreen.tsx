// Meter detail: usage history with interval consumption, tariff and billing
// configuration, gas conversion values, forecast.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import {
  billingPeriodRepo,
  gasConversionRepo,
  meterRepo,
  readingRepo,
  tariffRepo,
} from '../../data/repos'
import { computeConsumption } from '../../domain/consumption'
import { costInterval } from '../../domain/cost'
import { forecastBillingPeriod } from '../../domain/forecast'
import { formatDateDe } from '../../domain/dates'
import { formatEuro, formatGermanDecimal, parseGermanDecimal } from '../../domain/parse'
import { dec, roundMoney } from '../../domain/decimal'
import { EstimateTag, Field, Screen, meterIcon, meterKindLabel, meterUnit } from '../components/common'

export function MeterScreen() {
  const ctx = useRepoContext()
  const navigate = useNavigate()
  const { meterId } = useParams()

  const { data, refresh } = useAsyncData(async () => {
    if (!meterId) return undefined
    const meter = await meterRepo.get(ctx, meterId)
    if (!meter) return undefined
    const [readings, tariffs, conversions, billings] = await Promise.all([
      readingRepo.byMeter(ctx, meterId),
      tariffRepo.byMeter(ctx, meterId),
      gasConversionRepo.byMeter(ctx, meterId),
      billingPeriodRepo.byMeter(ctx, meterId),
    ])
    return { meter, readings, tariffs, conversions, billings }
  }, [meterId])

  if (data === undefined) return <Screen title="Zähler" back="/">{null}</Screen>
  const { meter, readings, tariffs, conversions, billings } = data
  const unit = meterUnit(meter.kind)
  const series = computeConsumption(readings)
  const billing = billings[billings.length - 1]

  const forecast =
    billing && tariffs.length > 0
      ? forecastBillingPeriod(readings, meter.kind, tariffs, billing, conversions)
      : undefined

  const missingGasConversion = meter.kind === 'gas' && conversions.length === 0

  return (
    <Screen title={`${meterIcon(meter.kind)} ${meter.label || meterKindLabel(meter.kind)}`} back={`/property/${meter.propertyId}`}>
      {missingGasConversion && (
        <div className="warning-box">
          Brennwert und Zustandszahl fehlen. Ohne diese Angaben können keine Kosten berechnet
          werden (m³ werden nie direkt mit einem kWh-Preis multipliziert).
        </div>
      )}

      {forecast?.ok === true && !forecast.value.insufficientData && (
        <section className="card">
          <h2 className="card-title">Prognose Abrechnungsjahr</h2>
          <div className="stat-grid">
            <div className="stat">
              <div className="value">
                {formatEuro(roundMoney(forecast.value.projectedTotalCost))}
              </div>
              <div className="label">
                Jahreskosten <EstimateTag />
              </div>
            </div>
            <div className="stat">
              <div
                className={`value balance ${forecast.value.balance.gte(0) ? 'positive' : 'negative'}`}
              >
                {formatEuro(roundMoney(forecast.value.balance.abs()))}
              </div>
              <div className="label">
                {forecast.value.balance.gte(0) ? 'Guthaben' : 'Nachzahlung'} <EstimateTag />
              </div>
            </div>
          </div>
        </section>
      )}

      <button className="btn" onClick={() => navigate(`/meter/${meter.id}/reading/new`)}>
        Stand eintragen
      </button>

      <section className="card" style={{ marginTop: '0.75rem' }}>
        <h2 className="card-title">Verbrauch</h2>
        {series.intervals.length === 0 && series.anomalies.length === 0 && (
          <p className="empty-state">Noch keine Intervalle. Mindestens zwei Stände nötig.</p>
        )}
        {[...series.intervals].reverse().map((interval) => {
          const cost =
            tariffs.length > 0
              ? costInterval(interval, meter.kind, tariffs, conversions)
              : undefined
          return (
            <div key={interval.toReadingId} className="list-row">
              <div>
                <div className="primary">
                  {formatGermanDecimal(interval.usage)} {unit}
                  {cost?.ok === true && (
                    <span style={{ color: 'var(--text-dim)' }}>
                      {' '}
                      · {formatEuro(roundMoney(cost.value.totalCost))}
                      {cost.value.segments.some((s) => s.prorated) && <EstimateTag />}
                    </span>
                  )}
                </div>
                <div className="secondary">
                  {formatDateDe(interval.from)} – {formatDateDe(interval.to)} ({interval.days}{' '}
                  Tage
                  {interval.dailyAverage &&
                    `, Ø ${formatGermanDecimal(interval.dailyAverage.toDecimalPlaces(2))} ${unit}/Tag`}
                  )
                </div>
              </div>
            </div>
          )
        })}
      </section>

      <section className="card">
        <h2 className="card-title">Zählerstände</h2>
        {readings.length === 0 && <p className="empty-state">Noch keine Stände.</p>}
        {[...readings].reverse().map((r) => (
          <Link
            key={r.id}
            className="list-row"
            to={`/meter/${meter.id}/reading/${r.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <span className="primary">
              {formatGermanDecimal(dec(r.value))} {unit}
              {r.isBaseline && (
                <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}> (Anfangsstand)</span>
              )}
            </span>
            <span className="secondary">{formatDateDe(r.date)}</span>
          </Link>
        ))}
      </section>

      <TariffSection meterId={meter.id} tariffs={tariffs} isGas={meter.kind === 'gas'} unit={unit === 'm³' && meter.kind === 'gas' ? 'kWh' : unit} onChange={refresh} />

      {meter.kind === 'gas' && (
        <GasConversionSection meterId={meter.id} conversions={conversions} onChange={refresh} />
      )}

      <BillingSection meterId={meter.id} billings={billings} onChange={refresh} />
    </Screen>
  )
}

function TariffSection({
  meterId,
  tariffs,
  unit,
  onChange,
}: {
  meterId: string
  tariffs: { id: string; effectiveFrom: string; unitPrice: string; basePricePerYear: string }[]
  isGas: boolean
  unit: string
  onChange: () => void
}) {
  const ctx = useRepoContext()
  const [adding, setAdding] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [basePrice, setBasePrice] = useState('')
  const [error, setError] = useState<string>()

  async function save() {
    const price = parseGermanDecimal(unitPrice)
    const base = parseGermanDecimal(basePrice === '' ? '0' : basePrice)
    if (!price.ok || !base.ok || !effectiveFrom) {
      setError('Bitte gültiges Datum und Preise angeben (z. B. 0,35).')
      return
    }
    await tariffRepo.save(ctx, {
      meterId,
      effectiveFrom,
      unitPrice: price.value.toString(),
      basePricePerYear: base.value.toString(),
    })
    setAdding(false)
    setEffectiveFrom('')
    setUnitPrice('')
    setBasePrice('')
    setError(undefined)
    onChange()
  }

  return (
    <section className="card">
      <h2 className="card-title">Tarife</h2>
      {tariffs.length === 0 && (
        <p className="empty-state">Kein Tarif hinterlegt. Ohne Tarif keine Kostenberechnung.</p>
      )}
      {tariffs.map((t) => (
        <div key={t.id} className="list-row">
          <span className="primary">
            {formatGermanDecimal(dec(t.unitPrice))} €/{unit}
            {dec(t.basePricePerYear).gt(0) && (
              <span style={{ color: 'var(--text-dim)' }}>
                {' '}
                + {formatEuro(dec(t.basePricePerYear))}/Jahr
              </span>
            )}
          </span>
          <span className="secondary">ab {formatDateDe(t.effectiveFrom)}</span>
        </div>
      ))}
      {adding ? (
        <div style={{ marginTop: '0.6rem' }}>
          <Field label="Gültig ab">
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label={`Arbeitspreis (€/${unit})`} error={error}>
            <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} inputMode="decimal" placeholder="0,35" />
          </Field>
          <Field label="Grundpreis (€/Jahr, optional)">
            <input value={basePrice} onChange={(e) => setBasePrice(e.target.value)} inputMode="decimal" placeholder="120" />
          </Field>
          <div className="btn-row">
            <button className="btn" onClick={() => void save()}>Speichern</button>
            <button className="btn secondary" onClick={() => setAdding(false)}>Abbrechen</button>
          </div>
        </div>
      ) : (
        <button className="btn secondary" style={{ marginTop: '0.6rem' }} onClick={() => setAdding(true)}>
          + Tarif ab Datum
        </button>
      )}
    </section>
  )
}

function GasConversionSection({
  meterId,
  conversions,
  onChange,
}: {
  meterId: string
  conversions: { id: string; effectiveFrom: string; brennwert: string; zustandszahl: string }[]
  onChange: () => void
}) {
  const ctx = useRepoContext()
  const [adding, setAdding] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [brennwert, setBrennwert] = useState('')
  const [zustandszahl, setZustandszahl] = useState('')
  const [error, setError] = useState<string>()

  async function save() {
    const b = parseGermanDecimal(brennwert)
    const z = parseGermanDecimal(zustandszahl === '' ? '1' : zustandszahl)
    if (!b.ok || !z.ok || !effectiveFrom) {
      setError('Bitte gültiges Datum und Werte angeben (z. B. 11,234).')
      return
    }
    await gasConversionRepo.save(ctx, {
      meterId,
      effectiveFrom,
      brennwert: b.value.toString(),
      zustandszahl: z.value.toString(),
    })
    setAdding(false)
    setError(undefined)
    onChange()
  }

  return (
    <section className="card">
      <h2 className="card-title">Gas-Umrechnung (m³ → kWh)</h2>
      {conversions.map((c) => (
        <div key={c.id} className="list-row">
          <span className="primary">
            Brennwert {formatGermanDecimal(dec(c.brennwert))} · Zustandszahl{' '}
            {formatGermanDecimal(dec(c.zustandszahl))}
          </span>
          <span className="secondary">ab {formatDateDe(c.effectiveFrom)}</span>
        </div>
      ))}
      {adding ? (
        <div style={{ marginTop: '0.6rem' }}>
          <Field label="Gültig ab">
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label="Brennwert (kWh/m³)" error={error}>
            <input value={brennwert} onChange={(e) => setBrennwert(e.target.value)} inputMode="decimal" placeholder="11,234" />
          </Field>
          <Field label="Zustandszahl (Standard 1)">
            <input value={zustandszahl} onChange={(e) => setZustandszahl(e.target.value)} inputMode="decimal" placeholder="0,95" />
          </Field>
          <div className="btn-row">
            <button className="btn" onClick={() => void save()}>Speichern</button>
            <button className="btn secondary" onClick={() => setAdding(false)}>Abbrechen</button>
          </div>
        </div>
      ) : (
        <button className="btn secondary" style={{ marginTop: '0.6rem' }} onClick={() => setAdding(true)}>
          + Werte ab Datum
        </button>
      )}
    </section>
  )
}

function BillingSection({
  meterId,
  billings,
  onChange,
}: {
  meterId: string
  billings: { id: string; start: string; end: string; monthlyAdvance: string }[]
  onChange: () => void
}) {
  const ctx = useRepoContext()
  const [adding, setAdding] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [advance, setAdvance] = useState('')
  const [error, setError] = useState<string>()

  async function save() {
    const a = parseGermanDecimal(advance)
    if (!a.ok || !start || !end || start > end) {
      setError('Bitte gültigen Zeitraum und Abschlag angeben.')
      return
    }
    await billingPeriodRepo.save(ctx, {
      meterId,
      start,
      end,
      monthlyAdvance: a.value.toString(),
    })
    setAdding(false)
    setError(undefined)
    onChange()
  }

  return (
    <section className="card">
      <h2 className="card-title">Abrechnungszeitraum & Abschlag</h2>
      {billings.map((b) => (
        <div key={b.id} className="list-row">
          <span className="primary">{formatEuro(dec(b.monthlyAdvance))}/Monat</span>
          <span className="secondary">
            {formatDateDe(b.start)} – {formatDateDe(b.end)}
          </span>
        </div>
      ))}
      {adding ? (
        <div style={{ marginTop: '0.6rem' }}>
          <Field label="Beginn">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Ende">
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Monatlicher Abschlag (€)" error={error}>
            <input value={advance} onChange={(e) => setAdvance(e.target.value)} inputMode="decimal" placeholder="80" />
          </Field>
          <div className="btn-row">
            <button className="btn" onClick={() => void save()}>Speichern</button>
            <button className="btn secondary" onClick={() => setAdding(false)}>Abbrechen</button>
          </div>
        </div>
      ) : (
        <button className="btn secondary" style={{ marginTop: '0.6rem' }} onClick={() => setAdding(true)}>
          + Zeitraum anlegen
        </button>
      )}
    </section>
  )
}

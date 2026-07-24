// Meter setup: the rarely-touched configuration split out of the meter detail
// screen — tariffs, gas conversion (gas only), and billing period/advance.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import { loadMeterBundle } from '../data'
import {
  billingPeriodRepo,
  gasConversionRepo,
  meterRepo,
  tariffRepo,
} from '../../data/repos'
import type {
  BillingPeriodRow,
  GasConversionRow,
  TariffRow,
} from '../../data/db'
import { formatDateDe } from '../../domain/dates'
import { formatEuro, formatGermanDecimal, parseGermanDecimal } from '../../domain/parse'
import { dec } from '../../domain/decimal'
import { ConfirmButton, Field, Screen } from '../components/common'
import { meterUnit } from '../components/meters'

export function MeterSetupScreen() {
  const ctx = useRepoContext()
  const navigate = useNavigate()
  const { meterId } = useParams()

  const { data, refresh } = useAsyncData(async () => {
    if (!meterId) return undefined
    return loadMeterBundle(ctx, meterId)
  }, [meterId])

  if (data === undefined) return <Screen title="Tarif & Abrechnung" back="/">{null}</Screen>

  const { meter, tariffs, gasConversions, billings } = data
  const tariffUnit = meter.kind === 'gas' ? 'kWh' : meterUnit(meter.kind)

  return (
    <Screen title="Tarif & Abrechnung" back={`/meter/${meter.id}`}>
      <TariffSection meterId={meter.id} tariffs={tariffs} unit={tariffUnit} onChange={refresh} />

      {meter.kind === 'gas' && (
        <GasConversionSection meterId={meter.id} conversions={gasConversions} onChange={refresh} />
      )}

      <BillingSection meterId={meter.id} billings={billings} onChange={refresh} />

      <section className="card">
        <h2 className="card-title">Zähler verwalten</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 0 }}>
          Bei einem Zählerwechsel tragen Sie einfach den neuen Anfangsstand über „Stand
          eintragen" ein und wählen „Zählerwechsel". Der Verlauf bleibt erhalten.
        </p>
        <ConfirmButton
          label="Zähler löschen"
          confirmLabel="Wirklich löschen"
          onConfirm={() => {
            void meterRepo
              .remove(ctx, meter.id)
              .then(() => navigate(`/property/${meter.propertyId}`, { replace: true }))
          }}
        />
      </section>
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
  tariffs: TariffRow[]
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

  async function remove(id: string) {
    await tariffRepo.remove(ctx, id)
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
          <div>
            <div className="primary">
              {formatGermanDecimal(dec(t.unitPrice))} €/{unit}
              {dec(t.basePricePerYear).gt(0) && (
                <span style={{ color: 'var(--text-dim)' }}>
                  {' '}
                  + {formatEuro(dec(t.basePricePerYear))}/Jahr
                </span>
              )}
            </div>
            <div className="secondary">ab {formatDateDe(t.effectiveFrom)}</div>
          </div>
          <button className="btn danger small" onClick={() => void remove(t.id)}>
            Löschen
          </button>
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
  conversions: GasConversionRow[]
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
    setEffectiveFrom('')
    setBrennwert('')
    setZustandszahl('')
    setError(undefined)
    onChange()
  }

  async function remove(id: string) {
    await gasConversionRepo.remove(ctx, id)
    onChange()
  }

  return (
    <section className="card">
      <h2 className="card-title">Gas-Umrechnung (m³ → kWh)</h2>
      {conversions.length === 0 && (
        <p className="empty-state">
          Noch keine Umrechnung hinterlegt. Ohne Brennwert und Zustandszahl keine Kostenberechnung.
        </p>
      )}
      {conversions.map((c) => (
        <div key={c.id} className="list-row">
          <div>
            <div className="primary">
              Brennwert {formatGermanDecimal(dec(c.brennwert))} · Zustandszahl{' '}
              {formatGermanDecimal(dec(c.zustandszahl))}
            </div>
            <div className="secondary">ab {formatDateDe(c.effectiveFrom)}</div>
          </div>
          <button className="btn danger small" onClick={() => void remove(c.id)}>
            Löschen
          </button>
        </div>
      ))}
      {adding ? (
        <div style={{ marginTop: '0.6rem' }}>
          <Field label="Gültig ab">
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </Field>
          <Field label="Brennwert (kWh/m³)" error={error}>
            <input value={brennwert} onChange={(e) => setBrennwert(e.target.value)} inputMode="decimal" placeholder="11,2" />
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
  billings: BillingPeriodRow[]
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
    setStart('')
    setEnd('')
    setAdvance('')
    setError(undefined)
    onChange()
  }

  async function remove(id: string) {
    await billingPeriodRepo.remove(ctx, id)
    onChange()
  }

  return (
    <section className="card">
      <h2 className="card-title">Abrechnungszeitraum & Abschlag</h2>
      {billings.length === 0 && (
        <p className="empty-state">Noch kein Abrechnungszeitraum hinterlegt.</p>
      )}
      {billings.map((b) => (
        <div key={b.id} className="list-row">
          <div>
            <div className="primary">{formatEuro(dec(b.monthlyAdvance))}/Monat</div>
            <div className="secondary">
              {formatDateDe(b.start)} – {formatDateDe(b.end)}
            </div>
          </div>
          <button className="btn danger small" onClick={() => void remove(b.id)}>
            Löschen
          </button>
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

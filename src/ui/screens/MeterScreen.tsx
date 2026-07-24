// Meter detail: the everyday view — enter a reading, see the forecast, browse
// consumption intervals and past readings. Rarely-touched configuration (tariff,
// gas conversion, billing period) lives on the dedicated setup screen.
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import { isConfigured, loadMeterBundle, meterForecast, todayIso } from '../data'
import { computeConsumption } from '../../domain/consumption'
import { costInterval } from '../../domain/cost'
import { formatDateDe } from '../../domain/dates'
import { formatEuro, formatGermanDecimal } from '../../domain/parse'
import { dec, roundMoney } from '../../domain/decimal'
import { EstimateTag, Screen } from '../components/common'
import { meterKindLabel, meterUnit } from '../components/meters'
import { CountUp } from '../reactbits'

export function MeterScreen() {
  const ctx = useRepoContext()
  const navigate = useNavigate()
  const { meterId } = useParams()

  const { data } = useAsyncData(async () => {
    if (!meterId) return undefined
    return loadMeterBundle(ctx, meterId)
  }, [meterId])

  if (data === undefined) return <Screen title="Zähler" back="/">{null}</Screen>

  const bundle = data
  const { meter, readings, tariffs, gasConversions } = bundle
  const unit = meterUnit(meter.kind)
  const series = computeConsumption(readings)
  const forecast = meterForecast(bundle, todayIso(ctx))
  const configured = isConfigured(bundle)
  const missingGasConversion = meter.kind === 'gas' && gasConversions.length === 0

  return (
    <Screen
      title={meter.label || meterKindLabel(meter.kind)}
      back={`/property/${meter.propertyId}`}
      action={
        <Link
          to={`/meter/${meter.id}/setup`}
          style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: '0.9rem' }}
        >
          Bearbeiten
        </Link>
      }
    >
      {missingGasConversion && (
        <div className="warning-box">
          Brennwert und Zustandszahl fehlen. Ohne diese Angaben können keine Kosten berechnet
          werden (m³ werden nie direkt mit einem kWh-Preis multipliziert).
        </div>
      )}

      <button className="btn" onClick={() => navigate(`/meter/${meter.id}/reading/new`)}>
        Stand eintragen
      </button>

      {!configured && (
        <div className="callout" style={{ marginTop: '0.75rem' }}>
          <span className="c-icon">💡</span>
          <div>
            <p style={{ margin: 0 }}>
              Hinterlegen Sie Tarif und Abschlag, um eine Prognose zu sehen.
            </p>
            <Link className="btn secondary" style={{ marginTop: '0.6rem' }} to={`/meter/${meter.id}/setup`}>
              Tarif & Abrechnung einrichten
            </Link>
          </div>
        </div>
      )}

      {configured && forecast && !forecast.insufficientData && (
        <section className="card" style={{ marginTop: '0.75rem' }}>
          <h2 className="card-title">Prognose Abrechnungsjahr</h2>
          <div className="stat-grid">
            <div className="stat">
              <div className="value">{formatEuro(roundMoney(forecast.projectedTotalCost))}</div>
              <div className="label">
                Jahreskosten <EstimateTag />
              </div>
            </div>
            <div className="stat">
              <div className={`value balance ${forecast.balance.gte(0) ? 'positive' : 'negative'}`}>
                <CountUp
                  to={roundMoney(forecast.balance.abs()).toNumber()}
                  duration={1}
                  separator="."
                />{' '}
                €
              </div>
              <div className="label">
                {forecast.balance.gte(0) ? 'Guthaben' : 'Nachzahlung'} <EstimateTag />
              </div>
            </div>
          </div>
        </section>
      )}

      {configured && forecast && forecast.insufficientData && (
        <section className="card" style={{ marginTop: '0.75rem' }}>
          <h2 className="card-title">Prognose Abrechnungsjahr</h2>
          <p className="hint">
            Noch nicht genügend Messdaten im Abrechnungszeitraum. Tragen Sie weitere Stände ein,
            um eine Prognose zu sehen.
          </p>
        </section>
      )}

      <section className="card" style={{ marginTop: '0.75rem' }}>
        <h2 className="card-title">Verbrauch</h2>
        {series.intervals.length === 0 && series.anomalies.length === 0 && (
          <p className="empty-state">Noch keine Intervalle. Mindestens zwei Stände nötig.</p>
        )}
        {[...series.intervals].reverse().map((interval) => {
          const cost =
            tariffs.length > 0
              ? costInterval(interval, meter.kind, tariffs, gasConversions)
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
                  {formatDateDe(interval.from)} – {formatDateDe(interval.to)} ({interval.days} Tage
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
            className="action-card"
            to={`/meter/${meter.id}/reading/${r.id}`}
          >
            <div className="body">
              <div className="label">
                {formatGermanDecimal(dec(r.value))} {unit}
                {r.isBaseline && (
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}> (Anfangsstand)</span>
                )}
              </div>
              <div className="sub">{formatDateDe(r.date)}</div>
            </div>
            <span className="chevron">›</span>
          </Link>
        ))}
      </section>

      <Link className="row-link" to={`/meter/${meter.id}/setup`}>
        Tarif & Abrechnung
        <span className="chevron">›</span>
      </Link>
    </Screen>
  )
}

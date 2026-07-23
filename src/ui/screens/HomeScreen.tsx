// Action-first home: "Enter reading" per meter, forecast card per property.
import { Link, useNavigate } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import {
  billingPeriodRepo,
  gasConversionRepo,
  meterRepo,
  propertyRepo,
  readingRepo,
  tariffRepo,
} from '../../data/repos'
import { forecastBillingPeriod } from '../../domain/forecast'
import { formatEuro } from '../../domain/parse'
import { roundMoney } from '../../domain/decimal'
import { Screen, EstimateTag, meterIcon, meterKindLabel } from '../components/common'
import type { MeterRow, PropertyRow } from '../../data/db'
import type { Decimal } from '../../domain/decimal'

interface PropertySummary {
  property: PropertyRow
  meters: MeterRow[]
  /** Sum of per-meter forecast balances (money only), if any forecast exists. */
  balance?: Decimal
}

export function HomeScreen() {
  const ctx = useRepoContext()
  const navigate = useNavigate()

  const { data } = useAsyncData(async (): Promise<PropertySummary[]> => {
    const properties = await propertyRepo.all(ctx)
    const summaries: PropertySummary[] = []
    for (const property of properties) {
      const meters = await meterRepo.byProperty(ctx, property.id)
      let balance: Decimal | undefined
      for (const meter of meters) {
        const [readings, tariffs, conversions, billings] = await Promise.all([
          readingRepo.byMeter(ctx, meter.id),
          tariffRepo.byMeter(ctx, meter.id),
          gasConversionRepo.byMeter(ctx, meter.id),
          billingPeriodRepo.byMeter(ctx, meter.id),
        ])
        const billing = billings[billings.length - 1]
        if (!billing || tariffs.length === 0) continue
        const f = forecastBillingPeriod(readings, meter.kind, tariffs, billing, conversions)
        if (f.ok && !f.value.insufficientData) {
          balance = balance === undefined ? f.value.balance : balance.plus(f.value.balance)
        }
      }
      summaries.push({ property, meters, balance })
    }
    return summaries
  }, [])

  if (data === undefined) return <Screen title="Zählerstand">{null}</Screen>

  return (
    <Screen title="Zählerstand">
      {data.length === 0 && (
        <div className="empty-state">
          <p>Noch keine Immobilie angelegt.</p>
        </div>
      )}

      {data.map(({ property, meters, balance }) => (
        <section key={property.id} className="card">
          <h2 className="card-title">
            <Link to={`/property/${property.id}`} style={{ color: 'inherit' }}>
              {property.label || property.postalCode} ›
            </Link>
          </h2>

          {balance !== undefined && (
            <p style={{ margin: '0 0 0.75rem' }}>
              Prognose:{' '}
              <span className={`balance ${balance.gte(0) ? 'positive' : 'negative'}`}>
                {balance.gte(0) ? 'Guthaben ' : 'Nachzahlung '}
                {formatEuro(roundMoney(balance.abs()))}
              </span>
              <EstimateTag />
            </p>
          )}

          {meters.map((meter) => (
            <button
              key={meter.id}
              className="action-card"
              onClick={() => navigate(`/meter/${meter.id}/reading/new`)}
            >
              <span className="icon">{meterIcon(meter.kind)}</span>
              <span className="body">
                <span className="label">Zählerstand eintragen</span>
                <br />
                <span className="sub">
                  {meter.label || meterKindLabel(meter.kind)}
                </span>
              </span>
              <span className="chevron">›</span>
            </button>
          ))}

          {meters.length === 0 && (
            <p className="empty-state" style={{ padding: '0.5rem' }}>
              Keine Zähler.{' '}
              <Link to={`/property/${property.id}`} style={{ color: 'var(--accent)' }}>
                Zähler hinzufügen
              </Link>
            </p>
          )}
        </section>
      ))}

      <Link className="btn secondary" style={{ textAlign: 'center', textDecoration: 'none' }} to="/property/new">
        + Immobilie hinzufügen
      </Link>
    </Screen>
  )
}

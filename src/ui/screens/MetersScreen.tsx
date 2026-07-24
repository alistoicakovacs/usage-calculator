// Flat overview of every meter across all properties, grouped by property.
import { Link, useNavigate } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import { propertyRepo } from '../../data/repos'
import {
  loadBundlesForProperty,
  lastReading,
  isConfigured,
  meterForecast,
  todayIso,
  type MeterBundle,
} from '../data'
import { Screen } from '../components/common'
import { meterIcon, meterKindLabel, meterUnit } from '../components/meters'
import { dec } from '../../domain/decimal'
import { formatEuro, formatGermanDecimal } from '../../domain/parse'
import { formatDateDe } from '../../domain/dates'
import type { MeterKind } from '../../domain/types'
import type { PropertyRow } from '../../data/db'

interface PropertyMeters {
  property: PropertyRow
  bundles: MeterBundle[]
}

function kindClass(kind: MeterKind): string {
  return kind === 'electricity' ? 'elec' : kind === 'gas' ? 'gas' : 'water'
}

export function MetersScreen() {
  const ctx = useRepoContext()
  const navigate = useNavigate()

  const { data } = useAsyncData(async (): Promise<PropertyMeters[]> => {
    const properties = await propertyRepo.all(ctx)
    const groups: PropertyMeters[] = []
    for (const property of properties) {
      const bundles = await loadBundlesForProperty(ctx, property.id)
      groups.push({ property, bundles })
    }
    return groups
  }, [])

  if (data === undefined) return <Screen title="Zähler">{null}</Screen>

  const today = todayIso(ctx)
  const hasMeters = data.some((g) => g.bundles.length > 0)

  if (!hasMeters) {
    return (
      <Screen title="Zähler">
        <div className="empty-state">
          <div className="emoji">🔢</div>
          <h3>Noch keine Zähler</h3>
          <p>Zähler gehören zu einem Objekt. Legen Sie zuerst ein Objekt an und fügen Sie dort Ihre Zähler hinzu.</p>
          <Link className="btn" to="/properties" style={{ textDecoration: 'none' }}>
            Zur Objektübersicht
          </Link>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Zähler">
      {data.map(({ property, bundles }) =>
        bundles.length === 0 ? null : (
          <section key={property.id}>
            <h2 className="section-title">{property.label || property.postalCode}</h2>
            {bundles.map((bundle) => {
              const meter = bundle.meter
              const reading = lastReading(bundle)
              const forecast = isConfigured(bundle) ? meterForecast(bundle, today) : undefined
              return (
                <button
                  key={meter.id}
                  className="action-card"
                  onClick={() => navigate(`/meter/${meter.id}`)}
                >
                  <span className={`icon ${kindClass(meter.kind)}`}>{meterIcon(meter.kind)}</span>
                  <span className="body">
                    <span className="label">{meter.label || meterKindLabel(meter.kind)}</span>
                    <span className="sub">
                      {reading
                        ? `${formatGermanDecimal(dec(reading.value))} ${meterUnit(meter.kind)} · ${formatDateDe(reading.date)}`
                        : 'Noch kein Stand'}
                    </span>
                  </span>
                  {forecast && (
                    <span className="trailing">{formatEuro(forecast.projectedTotalCost)}/Jahr</span>
                  )}
                  <span className="chevron">›</span>
                </button>
              )
            })}
          </section>
        ),
      )}
    </Screen>
  )
}

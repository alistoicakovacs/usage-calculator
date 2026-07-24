// Quick picker: choose a meter, then jump straight to its reading form.
import { Link, useNavigate } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import { propertyRepo } from '../../data/repos'
import {
  loadBundlesForProperty,
  lastReading,
  type MeterBundle,
} from '../data'
import { Screen } from '../components/common'
import { meterIcon, meterKindLabel, meterUnit } from '../components/meters'
import { dec } from '../../domain/decimal'
import { formatGermanDecimal } from '../../domain/parse'
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

export function AddReadingScreen() {
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

  if (data === undefined) {
    return <Screen title="Zählerstand eintragen" back="/">{null}</Screen>
  }

  const hasMeters = data.some((g) => g.bundles.length > 0)

  if (!hasMeters) {
    return (
      <Screen title="Zählerstand eintragen" back="/">
        <div className="empty-state">
          <div className="emoji">🔢</div>
          <h3>Noch keine Zähler</h3>
          <p>Legen Sie zuerst ein Objekt mit Zählern an, um einen Stand einzutragen.</p>
          <Link className="btn" to="/properties" style={{ textDecoration: 'none' }}>
            Objekt & Zähler anlegen
          </Link>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Zählerstand eintragen" back="/">
      <p className="hint">Für welchen Zähler möchten Sie einen Stand eintragen?</p>

      {data.map(({ property, bundles }) =>
        bundles.length === 0 ? null : (
          <section key={property.id}>
            <h2 className="section-title">{property.label || property.postalCode}</h2>
            {bundles.map((bundle) => {
              const meter = bundle.meter
              const reading = lastReading(bundle)
              return (
                <button
                  key={meter.id}
                  className="action-card"
                  onClick={() => navigate(`/meter/${meter.id}/reading/new`)}
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

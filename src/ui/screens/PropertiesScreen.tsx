// Properties tab: list every property with its meter count, add a new one.
import { Link } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import { meterRepo, propertyRepo } from '../../data/repos'
import { Screen } from '../components/common'
import type { PropertyRow } from '../../data/db'

interface PropertyEntry {
  property: PropertyRow
  meterCount: number
}

export function PropertiesScreen() {
  const ctx = useRepoContext()

  const { data } = useAsyncData(async (): Promise<PropertyEntry[]> => {
    const properties = await propertyRepo.all(ctx)
    return Promise.all(
      properties.map(async (property) => ({
        property,
        meterCount: (await meterRepo.byProperty(ctx, property.id)).length,
      })),
    )
  }, [])

  if (data === undefined) return <Screen title="Objekte">{null}</Screen>

  return (
    <Screen title="Objekte">
      {data.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">🏠</div>
          <h3>Noch keine Immobilie</h3>
          <p>Legen Sie Ihre erste Immobilie an, um Zähler und Stände zu erfassen.</p>
          <Link
            className="btn"
            style={{ textDecoration: 'none' }}
            to="/property/new"
          >
            Immobilie hinzufügen
          </Link>
        </div>
      ) : (
        <>
          {data.map(({ property, meterCount }) => (
            <Link key={property.id} className="action-card" to={`/property/${property.id}`}>
              <span className="icon">🏠</span>
              <span className="body">
                <span className="label">{property.label || property.postalCode}</span>
                <br />
                <span className="sub">
                  {property.postalCode} · {meterCount} Zähler
                </span>
              </span>
              <span className="chevron">›</span>
            </Link>
          ))}

          <Link
            className="btn"
            style={{ textAlign: 'center', textDecoration: 'none', marginTop: '0.75rem' }}
            to="/property/new"
          >
            Immobilie hinzufügen
          </Link>
        </>
      )}
    </Screen>
  )
}

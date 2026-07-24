// Dashboard-first landing: portfolio forecast hero, per-utility KPIs, and the
// list of properties with their meters. This is the app's flagship "Übersicht".
import { Link } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import { useSync } from '../SyncContext'
import {
  loadBundlesForProperty,
  lastReading,
  meterForecast,
  todayIso,
  type MeterBundle,
} from '../data'
import { propertyRepo } from '../../data/repos'
import { dec, type Decimal } from '../../domain/decimal'
import { formatEuro, formatGermanDecimal } from '../../domain/parse'
import { formatDateDe } from '../../domain/dates'
import { Screen, EstimateTag, Chip } from '../components/common'
import { meterIcon, meterKindLabel, meterUnit } from '../components/meters'
import { CountUp, Waves } from '../reactbits'
import type { MeterKind } from '../../domain/types'
import type { MeterRow, PropertyRow } from '../../data/db'

interface MeterView {
  meter: MeterRow
  lastText: string | undefined
  /** Forecast balance (money): > 0 Guthaben, < 0 Nachzahlung. */
  balance: Decimal | undefined
  /** Projected total cost for the billing period, if forecastable. */
  projected: Decimal | undefined
}

interface PropertyView {
  property: PropertyRow
  meters: MeterView[]
}

interface HomeData {
  properties: PropertyView[]
  /** Sum of every configured meter's forecast balance. */
  total: Decimal
  hasForecast: boolean
  costByKind: Partial<Record<MeterKind, Decimal>>
}

function meterView(bundle: MeterBundle, today: string): MeterView {
  const forecast = meterForecast(bundle, today)
  const last = lastReading(bundle)
  const lastText =
    last !== undefined
      ? `${formatGermanDecimal(dec(last.value))} ${meterUnit(bundle.meter.kind)} · ${formatDateDe(last.date)}`
      : undefined
  const usable = forecast !== undefined && !forecast.insufficientData
  return {
    meter: bundle.meter,
    lastText,
    balance: usable ? forecast.balance : undefined,
    projected: forecast !== undefined ? forecast.projectedTotalCost : undefined,
  }
}

export function HomeScreen() {
  const ctx = useRepoContext()
  const sync = useSync()

  const { data } = useAsyncData(async (): Promise<HomeData> => {
    const properties = await propertyRepo.all(ctx)
    const today = todayIso(ctx)

    const views: PropertyView[] = []
    let total = dec(0)
    let hasForecast = false
    const costByKind: Partial<Record<MeterKind, Decimal>> = {}

    for (const property of properties) {
      const bundles = await loadBundlesForProperty(ctx, property.id)
      const meters: MeterView[] = []
      for (const bundle of bundles) {
        const view = meterView(bundle, today)
        meters.push(view)
        if (view.balance !== undefined) {
          total = total.plus(view.balance)
          hasForecast = true
        }
        if (view.projected !== undefined) {
          const kind = bundle.meter.kind
          const prev = costByKind[kind]
          costByKind[kind] = prev === undefined ? view.projected : prev.plus(view.projected)
        }
      }
      views.push({ property, meters })
    }

    return { properties: views, total, hasForecast, costByKind }
  }, [])

  if (data === undefined) return <Screen title="Übersicht">{null}</Screen>

  const { properties, total, hasForecast, costByKind } = data
  const positive = total.gte(0)

  const conflictAction =
    sync.conflicts.length > 0 ? (
      <Link to="/conflicts" style={{ textDecoration: 'none' }}>
        <Chip tone="negative">{sync.conflicts.length} Konflikte</Chip>
      </Link>
    ) : undefined

  // Empty state: no properties configured at all.
  if (properties.length === 0) {
    return (
      <Screen title="Übersicht" action={conflictAction}>
        <div className="empty-state">
          <div className="emoji">🏠</div>
          <h3>Willkommen</h3>
          <p>
            Behalte deine Nebenkosten im Blick: Trage Zählerstände, Tarife und Abschläge ein
            und sieh sofort, ob dich eine Nachzahlung erwartet oder ein Guthaben.
          </p>
          <Link className="btn" to="/property/new" style={{ textDecoration: 'none' }}>
            Erste Immobilie anlegen
          </Link>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Übersicht" action={conflictAction}>
      <section className="hero">
        <Waves className="hero-bg" backgroundColor="transparent" lineColor="rgba(255,255,255,0.14)" />
        <div className="hero-content">
          <div className="eyebrow">Voraussichtliche Abrechnung</div>
          {hasForecast ? (
            <>
              <div className={`headline ${positive ? 'positive' : 'negative'}`}>
                <CountUp to={total.abs().toNumber()} duration={1} separator="." />
                <span className="cur"> €</span>
              </div>
              <div className="caption">
                {positive ? 'Voraussichtliches Guthaben' : 'Voraussichtliche Nachzahlung'}
                <EstimateTag />
              </div>
            </>
          ) : (
            <>
              <div className="headline">Noch keine Prognose</div>
              <div className="caption">
                Hinterlege Tarif und Abschlag an einem Zähler, um deine voraussichtliche
                Abrechnung zu sehen.
              </div>
            </>
          )}
        </div>
      </section>

      <div className="kpi-grid">
        {(['electricity', 'gas', 'water'] as const).map((kind) => {
          const cost = costByKind[kind]
          const accent = kind === 'electricity' ? 'elec' : kind === 'gas' ? 'gas' : 'water'
          return (
            <div key={kind} className="kpi">
              <div className="k-top">
                <span className={`dot ${accent}`} />
                {meterKindLabel(kind)}
              </div>
              {cost !== undefined ? (
                <>
                  <div className="k-value">
                    <CountUp to={cost.toNumber()} duration={1} separator="." />
                    <span className="cur"> €</span>
                  </div>
                  <div className="k-sub">€ / Jahr</div>
                </>
              ) : (
                <>
                  <div className="k-value">—</div>
                  <div className="k-sub">kein Zähler</div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <h2 className="section-title">Objekte</h2>
      {properties.map(({ property, meters }) => (
        <section key={property.id} className="card">
          <h3 className="card-title">
            <Link to={`/property/${property.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              {property.label || property.postalCode} ›
            </Link>
          </h3>

          {meters.length === 0 ? (
            <p className="sub">Noch keine Zähler.</p>
          ) : (
            meters.map((mv) => {
              const accent = mv.meter.kind === 'electricity' ? 'elec' : mv.meter.kind === 'gas' ? 'gas' : 'water'
              return (
                <Link
                  key={mv.meter.id}
                  className="action-card"
                  to={`/meter/${mv.meter.id}`}
                  style={{ textDecoration: 'none' }}
                >
                  <span className={`icon ${accent}`}>{meterIcon(mv.meter.kind)}</span>
                  <span className="body">
                    <span className="label">{mv.meter.label || meterKindLabel(mv.meter.kind)}</span>
                    <span className="sub">{mv.lastText ?? 'Noch kein Stand'}</span>
                  </span>
                  <span className="trailing">
                    {mv.balance !== undefined ? (
                      <Chip tone={mv.balance.gte(0) ? 'positive' : 'negative'}>
                        {mv.balance.gte(0) ? 'Guthaben' : 'Nachzahlung'} {formatEuro(mv.balance.abs())}
                      </Chip>
                    ) : mv.projected !== undefined ? (
                      formatEuro(mv.projected)
                    ) : null}
                  </span>
                  <span className="chevron">›</span>
                </Link>
              )
            })
          )}
        </section>
      ))}
    </Screen>
  )
}

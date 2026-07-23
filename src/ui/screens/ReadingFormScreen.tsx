// Reading entry: the primary action. German decimal input, duplicate-date
// rejection, and explicit decrease resolution (correction/rollover/replacement).
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import { meterRepo, readingRepo } from '../../data/repos'
import { validateReading, type DecreaseWarning } from '../../domain/validate'
import { formatDateDe } from '../../domain/dates'
import { formatGermanDecimal } from '../../domain/parse'
import { dec } from '../../domain/decimal'
import { Field, Screen, meterKindLabel, meterUnit } from '../components/common'

type DecreaseChoice = 'correction' | 'rollover' | 'replacement'

export function ReadingFormScreen() {
  const ctx = useRepoContext()
  const navigate = useNavigate()
  const { meterId, readingId } = useParams()
  const editing = readingId !== undefined && readingId !== 'new'

  const { data } = useAsyncData(async () => {
    if (!meterId) return undefined
    const meter = await meterRepo.get(ctx, meterId)
    if (!meter) return undefined
    const readings = await readingRepo.byMeter(ctx, meterId)
    return { meter, readings }
  }, [meterId])

  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>()
  const [warning, setWarning] = useState<DecreaseWarning>()
  const [choice, setChoice] = useState<DecreaseChoice>()
  const [initialized, setInitialized] = useState(false)

  if (data === undefined) return <Screen title="Zählerstand" back="/">{null}</Screen>
  const { meter, readings } = data
  const unit = meterUnit(meter.kind)

  const editingRow = editing ? readings.find((r) => r.id === readingId) : undefined
  if (editing && editingRow && !initialized) {
    setDate(editingRow.date)
    setValue(formatGermanDecimal(dec(editingRow.value)))
    setInitialized(true)
  }

  const last = readings[readings.length - 1]

  async function save() {
    if (!meterId) return
    const result = validateReading(
      { date, value, editingReadingId: editingRow?.id },
      readings,
    )
    if (!result.ok) {
      const e = result.error
      setWarning(undefined)
      setError(
        e.kind === 'invalid-date'
          ? 'Ungültiges Datum.'
          : e.kind === 'duplicate-date'
            ? 'Für dieses Datum existiert bereits ein Zählerstand.'
            : 'Ungültiger Wert. Beispiel: 12.345,6',
      )
      return
    }
    setError(undefined)

    if (result.value.warning && choice === undefined) {
      setWarning(result.value.warning)
      return
    }

    const isBaseline = choice === 'replacement'
    await readingRepo.save(ctx, {
      id: editingRow?.id,
      meterId,
      date: result.value.date,
      value: result.value.value,
      isBaseline: isBaseline || editingRow?.isBaseline,
      decreaseResolution: choice,
    })
    navigate(`/meter/${meterId}`, { replace: true })
  }

  async function removeReading() {
    if (!editingRow) return
    await readingRepo.remove(ctx, editingRow.id)
    navigate(`/meter/${meterId}`, { replace: true })
  }

  return (
    <Screen
      title={editing ? 'Stand bearbeiten' : 'Stand eintragen'}
      back={`/meter/${meterId}`}
    >
      <div className="card">
        <h2 className="card-title">
          {meter.label || meterKindLabel(meter.kind)} ({unit})
        </h2>

        {last && !editing && (
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 0 }}>
            Letzter Stand: {formatGermanDecimal(dec(last.value))} {unit} am{' '}
            {formatDateDe(last.date)}
          </p>
        )}

        <Field label="Datum">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <Field label={`Zählerstand (${unit})`} error={error}>
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(undefined)
              setWarning(undefined)
              setChoice(undefined)
            }}
            inputMode="decimal"
            placeholder="z. B. 12.345,6"
          />
        </Field>

        {warning && (
          <div className="warning-box">
            <strong>Niedrigerer Wert als zuvor</strong>
            <p style={{ margin: '0.3rem 0 0' }}>
              Der letzte Stand war {formatGermanDecimal(dec(warning.previousValue))} {unit}.
              Bitte wählen Sie, wie dieser Wert zu behandeln ist:
            </p>
            <div className="choice-group">
              <label>
                <input
                  type="radio"
                  name="decrease"
                  checked={choice === 'correction'}
                  onChange={() => setChoice('correction')}
                />
                <span>
                  <strong>Korrektur</strong> — der neue Wert ist richtig, frühere Eingabe war
                  fehlerhaft
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="decrease"
                  checked={choice === 'rollover'}
                  onChange={() => setChoice('rollover')}
                />
                <span>
                  <strong>Zählerüberlauf</strong> — das Zählwerk ist übergelaufen
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="decrease"
                  checked={choice === 'replacement'}
                  onChange={() => setChoice('replacement')}
                />
                <span>
                  <strong>Zählerwechsel</strong> — neuer Zähler, dieser Wert ist der neue
                  Anfangsstand
                </span>
              </label>
            </div>
          </div>
        )}

        <button
          className="btn"
          disabled={warning !== undefined && choice === undefined}
          onClick={() => void save()}
        >
          Speichern
        </button>

        {editing && (
          <div className="btn-row">
            <button className="btn danger" onClick={() => void removeReading()}>
              Eintrag löschen
            </button>
          </div>
        )}
      </div>
    </Screen>
  )
}

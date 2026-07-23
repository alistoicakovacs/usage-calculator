// Create/edit property with German postal code validation.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAsyncData, useRepoContext } from '../AppContext'
import { propertyRepo } from '../../data/repos'
import { validatePostalCode } from '../../domain/validate'
import { Field, Screen } from '../components/common'

export function PropertyFormScreen() {
  const ctx = useRepoContext()
  const navigate = useNavigate()
  const { propertyId } = useParams()
  const editing = propertyId !== undefined && propertyId !== 'new'

  const { data: existing } = useAsyncData(
    async () => (editing ? propertyRepo.get(ctx, propertyId) : undefined),
    [propertyId],
  )

  const [label, setLabel] = useState<string>()
  const [postalCode, setPostalCode] = useState<string>()
  const [error, setError] = useState<string>()

  if (editing && existing === undefined) return <Screen title="Immobilie" back="/">{null}</Screen>

  const labelValue = label ?? existing?.label ?? ''
  const postalValue = postalCode ?? existing?.postalCode ?? ''

  async function save() {
    const postal = validatePostalCode(postalValue)
    if (!postal.ok) {
      setError('Postleitzahl muss aus genau 5 Ziffern bestehen.')
      return
    }
    const saved = await propertyRepo.save(ctx, {
      id: editing ? propertyId : undefined,
      label: labelValue.trim(),
      postalCode: postal.value,
    })
    navigate(`/property/${saved.id}`, { replace: true })
  }

  return (
    <Screen title={editing ? 'Immobilie bearbeiten' : 'Neue Immobilie'} back="/">
      <div className="card">
        <Field label="Bezeichnung (optional)">
          <input
            value={labelValue}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="z. B. Haus Mühlhausen"
          />
        </Field>
        <Field label="Postleitzahl" error={error}>
          <input
            value={postalValue}
            onChange={(e) => {
              setPostalCode(e.target.value)
              setError(undefined)
            }}
            inputMode="numeric"
            placeholder="99974"
            maxLength={5}
          />
        </Field>
        <button className="btn" onClick={() => void save()}>
          Speichern
        </button>
      </div>
    </Screen>
  )
}

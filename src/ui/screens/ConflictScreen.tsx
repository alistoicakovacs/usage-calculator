// Side-by-side chooser for records two devices changed independently.
//
// Nothing is decided automatically here: the user sees both versions with the
// differing fields highlighted, and picks one. Their choice becomes a version
// that outranks both, so the other device adopts it silently.
import { useState } from 'react'
import { Screen } from '../components/common'
import { conflictSubject, describeConflict } from '../components/conflictFields'
import { useSync } from '../SyncContext'
import type { StoredConflict } from '../../sync/state'

export function ConflictScreen() {
  const { conflicts } = useSync()

  return (
    <Screen title="Konflikte" back="/settings">
      {conflicts.length === 0 ? (
        <div className="empty-state">
          <p>Keine Konflikte. Alle Geräte sind sich einig.</p>
        </div>
      ) : (
        <>
          <p className="hint">
            Diese Einträge wurden auf zwei Geräten unterschiedlich geändert. Bitte wählen Sie
            jeweils die Version, die gelten soll.
          </p>
          {conflicts.map((conflict) => (
            <ConflictCard key={conflict.id} conflict={conflict} />
          ))}
        </>
      )}
    </Screen>
  )
}

function ConflictCard({ conflict }: { conflict: StoredConflict }) {
  const { resolve } = useSync()
  const [busy, setBusy] = useState(false)
  const fields = describeConflict(conflict.table, conflict.local, conflict.remote)

  const choose = (side: 'local' | 'remote') => {
    setBusy(true)
    void resolve(conflict.id, side).finally(() => setBusy(false))
  }

  return (
    <article className="card">
      <h2 className="card-title">{conflictSubject(conflict.table)} geändert</h2>
      <p className="sub">
        Bemerkt am {new Date(conflict.detectedAt).toLocaleDateString('de-DE')}
      </p>

      <div className="table-scroll">
        <table className="conflict-table">
          <thead>
            <tr>
              <th scope="col">Feld</th>
              <th scope="col">Dieses Gerät</th>
              <th scope="col">Anderes Gerät</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.label} className={field.differs ? 'differs' : undefined}>
                <th scope="row">{field.label}</th>
                <td>{field.local}</td>
                <td>{field.remote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn" disabled={busy} onClick={() => choose('local')}>
        Diese Version behalten
      </button>
      <div className="btn-row">
        <button className="btn secondary" disabled={busy} onClick={() => choose('remote')}>
          Andere Version übernehmen
        </button>
      </div>
    </article>
  )
}

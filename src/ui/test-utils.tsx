// Test helpers for rendering screens with an isolated in-memory database.
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './AppContext'
import { createTestDb, type AppDatabase } from '../data/db'
import type { RepoContext } from '../data/repos'

export function makeTestContext(): { ctx: RepoContext; db: AppDatabase } {
  const db = createTestDb(`ui-test-${crypto.randomUUID()}`)
  let clock = 1_700_000_000_000
  const ctx: RepoContext = { db, deviceId: 'test-device', now: () => ++clock }
  return { ctx, db }
}

/**
 * Render an element at `initialPath`, with a route table so navigation and
 * `useParams` work. `routes` maps a path pattern to an element.
 */
export function renderScreen(
  ctx: RepoContext,
  initialPath: string,
  routes: Record<string, React.ReactNode>,
) {
  return render(
    <AppProvider value={ctx}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          {Object.entries(routes).map(([path, element]) => (
            <Route key={path} path={path} element={element} />
          ))}
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  )
}

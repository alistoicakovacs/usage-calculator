import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Screen } from './common'

function renderScreen(ui: React.ReactNode) {
  render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('Screen', () => {
  it('renders its title as a heading', () => {
    renderScreen(<Screen title="Zählerstand">{null}</Screen>)
    expect(screen.getByRole('heading', { name: 'Zählerstand' })).toBeInTheDocument()
  })

  it('shows a back link only when a back target is given', () => {
    renderScreen(
      <Screen title="Zähler" back="/meters">
        {null}
      </Screen>,
    )
    expect(screen.getByRole('link', { name: /zurück/i })).toHaveAttribute('href', '/meters')
  })

  it('omits the back link when no target is given', () => {
    renderScreen(<Screen title="Übersicht">{null}</Screen>)
    expect(screen.queryByRole('link', { name: /zurück/i })).not.toBeInTheDocument()
  })

  it('renders an optional header action', () => {
    renderScreen(
      <Screen title="Übersicht" action={<button type="button">Aktion</button>}>
        {null}
      </Screen>,
    )
    expect(screen.getByRole('button', { name: 'Aktion' })).toBeInTheDocument()
  })

  it('does not put sync chrome in the header anymore', () => {
    renderScreen(<Screen title="Zählerstand">{null}</Screen>)
    expect(screen.queryByRole('link', { name: /synchronisierung/i })).not.toBeInTheDocument()
  })
})

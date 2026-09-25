import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute, storeLoginToken } from '../test/render'

describe('app shell', () => {
  it('shows the main nav links, with Timesheets and Vacations disabled', async () => {
    // A team lead, so Approvals is among the links (see RoleNavigation.test.tsx for who sees what).
    await storeLoginToken('sofia@preyingmantis.test')
    renderRoute('/trainings')

    // Query by role and accessible name, as a screen reader user would find them, not by class or test id.
    // findBy waits: the page only renders once the stored token has been checked against /me.
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    for (const name of ['Trainings', 'Seats', 'Approvals']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
    for (const name of ['Timesheets', 'Vacations']) {
      expect(within(nav).getByRole('link', { name: new RegExp(name) })).toHaveAttribute('aria-disabled', 'true')
    }
    expect(within(nav).getByRole('link', { name: 'Trainings' })).toHaveAttribute('aria-current', 'page')
  })
})

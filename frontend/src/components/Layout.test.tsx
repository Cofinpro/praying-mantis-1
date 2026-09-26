import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute, storeLoginToken } from '../test/render'

describe('app shell', () => {
  it('shows the main nav links, with Timesheets and Vacations disabled', async () => {
    // A team lead, so Approvals is among the links (see RoleNavigation.test.tsx for who sees what).
    await storeLoginToken('test.lead01@example.com')
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

  it('places a theme switcher inside the hamburger menu for mobile viewports', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 500 })
    window.dispatchEvent(new Event('resize'))

    await storeLoginToken('test.lead01@example.com')
    renderRoute('/trainings')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const switcher = within(nav).getByRole('button', { name: /switch to (dark|light) mode/i })
    expect(switcher).toBeVisible()
  })

  it('places a theme switcher in the navigation bar for desktop viewports', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1200 })
    window.dispatchEvent(new Event('resize'))

    await storeLoginToken('test.lead01@example.com')
    renderRoute('/trainings')

    const banners = await screen.findAllByRole('banner')
    const topBar = banners[0]
    
    const switchers = within(topBar).getAllByRole('button', { name: /switch to (dark|light) mode/i })
    
    const nav = within(topBar).getByRole('navigation', { name: 'Main' })
    const navSwitchers = within(nav).queryAllByRole('button', { name: /switch to (dark|light) mode/i })
    
    const desktopSwitcher = switchers.find(s => !navSwitchers.includes(s))
    expect(desktopSwitcher).toBeVisible()
  })
})

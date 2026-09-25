import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute, storeLoginToken } from '../test/render'

const admin = 'admin@cofinpro.pt'
const teamLead = 'sofia@cofinpro.pt'
const employee = 'joao@cofinpro.pt'

async function renderAs(email: string, path: string) {
  await storeLoginToken(email)
  renderRoute(path)
  // Wait until the stored token has been checked and the page is shown.
  await screen.findByRole('navigation', { name: 'Main' })
}

describe('Approvals nav link', () => {
  it.each([
    ['a team lead', teamLead],
    ['an admin', admin],
  ])('shows for %s', async (_, email) => {
    await renderAs(email, '/trainings')

    expect(screen.getByRole('link', { name: 'Approvals' })).toBeInTheDocument()
  })

  it('is hidden for an employee who is neither', async () => {
    await renderAs(employee, '/trainings')

    expect(screen.queryByRole('link', { name: 'Approvals' })).not.toBeInTheDocument()
  })
})

describe('New training button', () => {
  it('shows on /trainings for an admin and links to the form', async () => {
    await renderAs(admin, '/trainings')

    expect(screen.getByRole('link', { name: '+ New training' })).toHaveAttribute('href', '/admin/trainings/new')
  })

  it.each([
    ['a team lead', teamLead],
    ['an employee', employee],
  ])('is hidden for %s', async (_, email) => {
    await renderAs(email, '/trainings')

    expect(screen.queryByRole('link', { name: '+ New training' })).not.toBeInTheDocument()
  })
})

describe('Not allowed page', () => {
  it.each([
    ['an admin page as a team lead', teamLead, '/admin/trainings/new'],
    ['an admin page as an employee', employee, '/admin/trainings/new'],
    ['/approvals as an employee', employee, '/approvals'],
  ])('shows when visiting %s', async (_, email, path) => {
    await renderAs(email, path)

    expect(screen.getByRole('heading', { name: 'Not allowed' })).toBeInTheDocument()
  })

  it.each([
    ['an admin page as an admin', admin, '/admin/trainings/new', 'New training'],
    ['/approvals as a team lead', teamLead, '/approvals', 'Approvals'],
    ['/approvals as an admin', admin, '/approvals', 'Approvals'],
  ])('does not show when visiting %s', async (_, email, path, heading) => {
    await renderAs(email, path)

    expect(screen.getByRole('heading', { name: heading, level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Not allowed' })).not.toBeInTheDocument()
  })
})

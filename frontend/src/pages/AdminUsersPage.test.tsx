import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

async function asAdmin(path: string) {
  await storeLoginToken('admin@cofinpro.pt')
  const view = renderRoute(path)
  return { ...view, user: userEvent.setup() }
}

// Records the bodies the pages send, then lets the shared mocks answer
function recordBodies(method: 'post' | 'patch', path: string) {
  const bodies: unknown[] = []
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push(await request.clone().json())
      return undefined
    }),
  )
  return bodies
}

describe('admin users', () => {
  it('lists everyone with client, level, team lead and roles', async () => {
    await asAdmin('/admin/users')

    const list = await screen.findByRole('list', { name: 'Users' })
    const joao = within(list).getByRole('link', { name: 'João Silva' }).closest('li')!
    expect(joao).toHaveTextContent('joao@cofinpro.pt')
    expect(joao).toHaveTextContent('DKB · Junior')
    expect(joao).toHaveTextContent('Lead: Sofia Martins')
    const sofia = within(list).getByRole('link', { name: 'Sofia Martins' }).closest('li')!
    expect(sofia).toHaveTextContent('Team lead')
  })

  it('searches by name or email', async () => {
    const { user } = await asAdmin('/admin/users')
    await screen.findByRole('list', { name: 'Users' })

    await user.type(screen.getByLabelText('Search'), 'beatriz')

    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByRole('link', { name: 'Beatriz Reis' })).toBeInTheDocument()
  })

  it('creates a user with a team lead, then lists them', async () => {
    const bodies = recordBodies('post', '*/api/admin/users')
    const { user, router } = await asAdmin('/admin/users/new')
    await screen.findByRole('heading', { name: 'New user' })

    await user.type(screen.getByLabelText('Name'), 'Ana Costa')
    await user.type(screen.getByLabelText('Email'), 'ana.costa@cofinpro.pt')
    await user.selectOptions(screen.getByLabelText('Client'), 'VV')
    await user.selectOptions(screen.getByLabelText('Level'), 'Expert')
    await screen.findByRole('option', { name: 'Sofia Martins' })
    await user.selectOptions(screen.getByLabelText('Team lead'), 'Sofia Martins')
    await user.type(screen.getByLabelText('Password'), 'a-long-password')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'))
    expect(await screen.findByRole('link', { name: 'Ana Costa' })).toBeInTheDocument()
    expect(bodies).toEqual([
      {
        name: 'Ana Costa',
        email: 'ana.costa@cofinpro.pt',
        client: 'VV',
        level: 'expert',
        is_admin: false,
        team_lead_id: 2,
        password: 'a-long-password',
      },
    ])
  })

  it('checks the fields before sending, and shows email_taken on the email', async () => {
    const { user } = await asAdmin('/admin/users/new')
    await screen.findByRole('heading', { name: 'New user' })

    await user.click(screen.getByRole('button', { name: 'Create user' }))
    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Enter a name')
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Use at least 8 characters')

    await user.type(screen.getByLabelText('Name'), 'Another Sofia')
    await user.type(screen.getByLabelText('Email'), 'sofia@cofinpro.pt')
    await user.type(screen.getByLabelText('Password'), 'a-long-password')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('A user with this email already exists'))
  })

  it('edits only what changed', async () => {
    const bodies = recordBodies('patch', '*/api/admin/users/:id')
    const { user, router } = await asAdmin('/admin/users/5/edit')
    const level = await screen.findByLabelText('Level')

    await user.selectOptions(level, 'Senior')
    await user.selectOptions(screen.getByLabelText('Team lead'), 'No team lead (an admin approves their requests)')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/users'))
    expect(bodies).toEqual([{ level: 'senior', team_lead_id: null }])
  })

  it("shows the API's reason when a change isn't allowed", async () => {
    server.use(
      http.patch('*/api/admin/users/:id', () =>
        HttpResponse.json(
          { detail: [{ type: 'team_lead_cycle', loc: ['body', 'team_lead_id'], msg: 'That would make a loop of team leads' }] },
          { status: 422 },
        ),
      ),
    )
    const { user } = await asAdmin('/admin/users/3/edit')
    await screen.findByRole('option', { name: 'Inês Rocha' }) // the team lead choices load separately

    await user.selectOptions(screen.getByLabelText('Team lead'), 'Inês Rocha')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That would make a loop of team leads')
  })

  it('resets a password, and the user can log in with it', async () => {
    const { user } = await asAdmin('/admin/users/5/edit')

    await user.type(await screen.findByLabelText('New password'), 'reset-by-admin')
    await user.click(screen.getByRole('button', { name: 'Set password' }))

    expect(await screen.findByText(/Password changed/)).toBeInTheDocument()
    const login = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'joao@cofinpro.pt', password: 'reset-by-admin' }),
    })
    expect(login.status).toBe(200)
  })

  it('shows "Users" in the nav for admins only', async () => {
    await storeLoginToken('sofia@cofinpro.pt')
    renderRoute('/trainings')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('and admins see it', async () => {
    await asAdmin('/trainings')

    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users')
  })
})

describe('change my password', () => {
  // A different person per test: the mocks remember a changed password for the rest of the file
  async function openProfile(email: string) {
    await storeLoginToken(email)
    renderRoute('/profile')
    await screen.findByRole('heading', { name: 'Change password' })
    return userEvent.setup()
  }

  it('changes it, and the new one works for logging in', async () => {
    const user = await openProfile('marta@cofinpro.pt')

    await user.type(screen.getByLabelText('Current password'), 'password123')
    await user.type(screen.getByLabelText('New password'), 'martas-new-pass')
    await user.type(screen.getByLabelText('New password again'), 'martas-new-pass')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Your password was changed.')).toBeInTheDocument()
    const login = await fetch('http://localhost:8000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'marta@cofinpro.pt', password: 'martas-new-pass' }),
    })
    expect(login.status).toBe(200)
  })

  it('says when the two new passwords differ, without sending', async () => {
    const user = await openProfile('pedro@cofinpro.pt')

    await user.type(screen.getByLabelText('Current password'), 'password123')
    await user.type(screen.getByLabelText('New password'), 'one-password')
    await user.type(screen.getByLabelText('New password again'), 'another-one')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(screen.getByLabelText('New password again')).toHaveAccessibleDescription("The two new passwords don't match")
  })

  it('shows a wrong current password on its field', async () => {
    server.use(
      http.post('*/api/me/password', () =>
        HttpResponse.json(
          { detail: [{ type: 'wrong_password', loc: ['body', 'current_password'], msg: "That isn't your current password" }] },
          { status: 422 },
        ),
      ),
    )
    const user = await openProfile('rita@cofinpro.pt')

    await user.type(screen.getByLabelText('Current password'), 'not-it')
    await user.type(screen.getByLabelText('New password'), 'another-password')
    await user.type(screen.getByLabelText('New password again'), 'another-password')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveAccessibleDescription("That isn't your current password"))
  })
})

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { authToken } from '../api/client'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

async function logIn(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Log in' }))
}

describe('login', () => {
  it('goes to /trainings and shows my name after logging in', async () => {
    const { router } = renderRoute('/login')

    await logIn('sofia@cofinpro.pt', 'password123')

    expect(await screen.findByRole('link', { name: 'Sofia Martins' })).toHaveAttribute('href', '/profile')
    expect(router.state.location.pathname).toBe('/trainings')
  })

  it("shows the API's error message on a 401 and stays on the login page", async () => {
    const { router } = renderRoute('/login')

    await logIn('sofia@cofinpro.pt', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.getByLabelText('Password')).toBeInvalid() // wrong credentials: the fields are marked
  })

  it("says it can't reach the server when the request itself fails", async () => {
    server.use(http.post('*/api/auth/login', () => HttpResponse.error()))
    renderRoute('/login')

    await logIn('sofia@cofinpro.pt', 'password123')

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
    expect(screen.getByLabelText('Password')).not.toBeInvalid() // not the user's typing: fields stay normal
  })

  it('explains a slow login (the backend waking up)', async () => {
    server.use(
      http.post('*/api/auth/login', async () => {
        await delay(5000)
        return HttpResponse.json({ detail: 'Invalid email or password' }, { status: 401 })
      }),
    )
    renderRoute('/login')

    await logIn('sofia@cofinpro.pt', 'password123')

    expect(await screen.findByText('The server is waking up. This can take up to a minute.', {}, { timeout: 6000 })).toBeInTheDocument()
  }, 10_000)

  it('redirects to /login when not logged in', async () => {
    const { router } = renderRoute('/seats')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('stays logged in across a refresh', async () => {
    await storeLoginToken('tiago@cofinpro.pt')

    const { router } = renderRoute('/seats')

    expect(await screen.findByRole('link', { name: 'Tiago Costa' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/seats')
  })

  it('goes to /login when the stored token is rejected (e.g. expired)', async () => {
    await storeLoginToken('tiago@cofinpro.pt')
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })))

    const { router } = renderRoute('/seats')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(authToken.get()).toBeNull()
  })
})

describe('logout', () => {
  it('clears the token and goes to /login', async () => {
    await storeLoginToken('joao@cofinpro.pt')
    const { router } = renderRoute('/trainings')

    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(authToken.get()).toBeNull()
  })
})

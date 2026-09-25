import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
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

    await logIn('sofia@preyingmantis.test', 'password123')

    expect(await screen.findByRole('link', { name: 'Sofia Martins' })).toHaveAttribute('href', '/profile')
    expect(router.state.location.pathname).toBe('/trainings')
  })

  it("shows the API's error message on a 401 and stays on the login page", async () => {
    const { router } = renderRoute('/login')

    await logIn('sofia@preyingmantis.test', 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(router.state.location.pathname).toBe('/login')
  })

  it("says it can't reach the server when the request itself fails", async () => {
    server.use(http.post('*/api/auth/login', () => HttpResponse.error()))
    renderRoute('/login')

    await logIn('sofia@preyingmantis.test', 'password123')

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
  })

  it('redirects to /login when not logged in', async () => {
    const { router } = renderRoute('/seats')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('stays logged in across a refresh', async () => {
    await storeLoginToken('tiago@preyingmantis.test')

    const { router } = renderRoute('/seats')

    expect(await screen.findByRole('link', { name: 'Tiago Costa' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/seats')
  })

  it('goes to /login when the stored token is rejected (e.g. expired)', async () => {
    await storeLoginToken('tiago@preyingmantis.test')
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })))

    const { router } = renderRoute('/seats')

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(authToken.get()).toBeNull()
  })
})

describe('logout', () => {
  it('clears the token and goes to /login', async () => {
    await storeLoginToken('joao@preyingmantis.test')
    const { router } = renderRoute('/trainings')

    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }))

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(authToken.get()).toBeNull()
  })
})

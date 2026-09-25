import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { server } from '../mocks/server'
import { login } from './auth'
import { api, ApiError, authToken, onUnauthorized } from './client'

describe('API client auth handling', () => {
  const listener = vi.fn()
  let unsubscribe = () => {}

  afterEach(() => {
    unsubscribe()
    listener.mockReset()
  })

  it('sends the stored token as a Bearer header', async () => {
    authToken.set('stored-token')
    let authorization: string | null = null
    server.use(
      http.get('*/api/auth/me', ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json({})
      }),
    )

    await api.get('/api/auth/me')

    expect(authorization).toBe('Bearer stored-token')
  })

  it('clears the token and logs out on any 401', async () => {
    authToken.set('expired-token')
    unsubscribe = onUnauthorized(listener)
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })))

    await expect(api.get('/api/auth/me')).rejects.toBeInstanceOf(ApiError)

    expect(authToken.get()).toBeNull()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('does not log out when the login call itself returns 401', async () => {
    authToken.set('existing-token')
    unsubscribe = onUnauthorized(listener)

    await expect(login({ email: 'sofia@preyingmantis.test', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
      detail: 'Invalid email or password',
    })

    expect(authToken.get()).toBe('existing-token')
    expect(listener).not.toHaveBeenCalled()
  })
})

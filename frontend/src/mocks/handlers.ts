import { http, HttpResponse } from 'msw'
import type { CurrentUser, LoginRequest, TokenResponse } from '../api/auth'
import type { DbHealthResponse, HelloResponse } from '../api/health'
import { findSeedUserByEmail, findSeedUserById, SEED_PASSWORD, toCurrentUser } from './data/users'

// The mock token is just the user id. The real one is a signed JWT, but the app treats both as opaque.
const MOCK_TOKEN_PREFIX = 'mock-token-'

function userFromRequest(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
  if (!token.startsWith(MOCK_TOKEN_PREFIX)) {
    return undefined
  }
  return findSeedUserById(Number(token.slice(MOCK_TOKEN_PREFIX.length)))
}

const notAuthenticated = () => HttpResponse.json({ detail: 'Not authenticated' }, { status: 401 })

// One handler per endpoint, answering with contract-shaped data. The `*` matches any origin, so the handlers
// don't need to know VITE_API_URL. The same handlers serve the tests (server.ts).
export const handlers = [
  http.get('*/api/', () => HttpResponse.json<HelloResponse>({ message: 'Hello from the MSW mocks' })),

  http.get('*/api/health/db', () => HttpResponse.json<DbHealthResponse>({ database: 'ok' })),

  // Accepts the seed logins (see CLAUDE.md), all with the seed password.
  http.post('*/api/auth/login', async ({ request }) => {
    const { email, password } = (await request.json()) as LoginRequest
    const user = findSeedUserByEmail(email)
    if (!user || password !== SEED_PASSWORD) {
      return HttpResponse.json({ detail: 'Invalid email or password' }, { status: 401 })
    }
    return HttpResponse.json<TokenResponse>({ access_token: `${MOCK_TOKEN_PREFIX}${user.id}`, token_type: 'bearer' })
  }),

  http.get('*/api/auth/me', ({ request }) => {
    const user = userFromRequest(request)
    return user ? HttpResponse.json<CurrentUser>(toCurrentUser(user)) : notAuthenticated()
  }),
]

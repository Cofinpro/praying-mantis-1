import { http, HttpResponse } from 'msw'
import type { CurrentUser, LoginRequest, TokenResponse } from '../api/auth'
import type { DbHealthResponse, HelloResponse } from '../api/health'
import type { TrainingCreate, TrainingRead, TrainingSummary } from '../api/trainings'
import { isLevel } from '../trainings/levels'
import { listMockTrainings, mockTrainings, toSummary } from './data/trainings'
import type { UserSummary } from '../api/users'
import { findSeedUserByEmail, findSeedUserById, searchSeedUsers, SEED_PASSWORD, toCurrentUser } from './data/users'

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
const adminsOnly = () => HttpResponse.json({ detail: 'Admins only' }, { status: 403 })


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

  http.get('*/api/users', ({ request }) => {
    const user = userFromRequest(request)
    if (!user) return notAuthenticated()
    if (!user.is_admin) return adminsOnly()
    const search = new URL(request.url).searchParams.get('search') ?? ''
    return HttpResponse.json<UserSummary[]>(searchSeedUsers(search))
  }),

  http.get('*/api/trainings', ({ request }) => {
    const user = userFromRequest(request)
    if (!user) return notAuthenticated()
    const level = new URL(request.url).searchParams.get('level')
    return HttpResponse.json<TrainingSummary[]>(listMockTrainings(user, isLevel(level) ? level : null))
  }),

  // Trusts the body: the form validates it first. The real backend checks every rule again (422).
  http.post('*/api/trainings', async ({ request }) => {
    const user = userFromRequest(request)
    if (!user) return notAuthenticated()
    if (!user.is_admin) return adminsOnly()
    const body = (await request.json()) as TrainingCreate
    const trainer = body.trainer_id ? findSeedUserById(body.trainer_id) : undefined
    const training = {
      id: Math.max(...mockTrainings.map((t) => t.id)) + 1,
      name: body.name,
      description: body.description,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      levels: body.levels,
      trainer: trainer ? { id: trainer.id, name: trainer.name } : null,
      external_trainer_name: body.external_trainer_name ?? null,
      max_seats: body.max_seats,
      seats_left: body.max_seats,
      cancelled: false,
      enrollments: {},
    }
    // Kept in memory until the page reloads, so the new training shows up in the list.
    mockTrainings.push(training)
    return HttpResponse.json<TrainingRead>(
      { ...toSummary(training, user.id), description: training.description },
      { status: 201 },
    )
  }),
]

import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { login } from '../api/auth'
import { authToken } from '../api/client'
import { AuthProvider } from '../auth/AuthProvider'
import { SEED_PASSWORD } from '../mocks/data/users'
import { routes } from '../router'

// Renders the real route table at `path`, inside the real AuthProvider. A memory router keeps the URL
// in memory, so tests don't need a browser address bar and can start on any page.
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    router,
    ...render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    ),
  }
}

// Starts a test as a logged-in seed user, as if they had logged in on an earlier visit.
export async function storeLoginToken(email: string) {
  const { access_token } = await login({ email, password: SEED_PASSWORD })
  authToken.set(access_token)
}

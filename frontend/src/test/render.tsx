import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { login } from '../api/auth'
import { authToken } from '../api/client'
import { createQueryClient } from '../api/queryClient'
import { AuthProvider } from '../auth/AuthProvider'
import { SEED_PASSWORD } from '../mocks/data/users'
import { routes } from '../router'

// Renders the real route table at `path`, inside the real providers. A memory router keeps the URL
// in memory, so tests don't need a browser address bar and can start on any page. Each test gets a
// fresh query cache, so no data leaks from one test into the next.
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  return {
    router,
    ...render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>,
    ),
  }
}

// Starts a test as a logged-in seed user, as if they had logged in on an earlier visit.
export async function storeLoginToken(email: string) {
  const { access_token } = await login({ email, password: SEED_PASSWORD })
  authToken.set(access_token)
}

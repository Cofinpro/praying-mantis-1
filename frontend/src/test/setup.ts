import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from '../mocks/server'

// Every API call in a test must have a handler, as in the browser (see mocks/browser.ts).
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  // Unmount what the test rendered. Testing Library only does this by itself with Vitest's `globals: true`.
  cleanup()
  // Drop any `server.use(...)` overrides a test added, so the next one starts from the shared handlers.
  server.resetHandlers()
  // jsdom keeps localStorage for the whole file, so a login token would leak into the next test.
  localStorage.clear()
})

afterAll(() => server.close())

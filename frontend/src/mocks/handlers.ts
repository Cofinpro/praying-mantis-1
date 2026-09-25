import { http, HttpResponse } from 'msw'
import type { DbHealthResponse, HelloResponse } from '../api/health'

// One handler per endpoint, answering with contract-shaped data. The `*` matches any origin, so the handlers
// don't need to know VITE_API_URL. The same handlers serve the tests (server.ts).
export const handlers = [
  http.get('*/api/', () => HttpResponse.json<HelloResponse>({ message: 'Hello from the MSW mocks' })),

  http.get('*/api/health/db', () => HttpResponse.json<DbHealthResponse>({ database: 'ok' })),
]

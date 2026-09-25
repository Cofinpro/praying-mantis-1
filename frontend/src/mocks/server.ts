import { setupServer } from 'msw/node'
import { handlers } from './handlers'

// The Node twin of browser.ts: the same handlers, but intercepting fetch inside the test process
// instead of through a service worker.
export const server = setupServer(...handlers)

import { setupWorker } from 'msw/browser'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

export function startMockWorker() {
  return worker.start({
    // Under /<repo>/ on GitHub Pages the worker file isn't at the site root.
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    // Every API call must have a handler, so a missing one is an error. Anything else (fonts, Vite modules)
    // goes to the network without a warning.
    onUnhandledRequest(request, print) {
      if (new URL(request.url).pathname.startsWith('/api/')) {
        print.error()
      }
    },
  })
}

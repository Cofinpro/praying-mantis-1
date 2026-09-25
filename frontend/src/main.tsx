import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import '@fontsource-variable/inter'
import { AuthProvider } from './auth/AuthProvider'
import './index.css'
import { router } from './router'

// With VITE_USE_MOCKS=true, MSW answers every API call before the app renders its first request.
// Vite replaces `import.meta.env.VITE_USE_MOCKS` at build time, so without mocks this import
// is dead code and MSW isn't in the bundle at all.
async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCKS !== 'true') {
    return
  }
  const { startMockWorker } = await import('./mocks/browser')
  await startMockWorker()
}

await enableMocking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)

import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from './useAuth'

// Route guard, like a vue-router `beforeEach` that returns '/login', but as a wrapper component.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, status } = useAuth()

  if (status === 'checking') {
    // Don't flash the login page while a stored token is being checked.
    return null
  }
  if (user === null) {
    return <Navigate to="/login" replace />
  }
  return children
}

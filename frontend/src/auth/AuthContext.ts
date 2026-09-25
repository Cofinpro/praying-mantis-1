import { createContext } from 'react'
import type { CurrentUser } from '../api/auth'

export type AuthState = {
  // null when logged out. Inside <RequireAuth> it's always set.
  user: CurrentUser | null
  // 'checking' while a token from a previous visit is being checked against GET /api/auth/me.
  status: 'checking' | 'ready'
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

// Like provide/inject in Vue: AuthProvider provides the value, useAuth() reads it anywhere below.
export const AuthContext = createContext<AuthState | null>(null)

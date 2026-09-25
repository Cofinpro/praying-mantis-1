import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMe, login as loginRequest, type CurrentUser } from '../api/auth'
import { authToken, onUnauthorized } from '../api/client'
import { AuthContext, type AuthState } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  // A lazy initial value: read localStorage once, on the first render, not on every render.
  const [status, setStatus] = useState<AuthState['status']>(() => (authToken.get() ? 'checking' : 'ready'))

  // Stay logged in across refreshes: a stored token is only trusted once /me accepts it.
  useEffect(() => {
    if (!authToken.get()) {
      return
    }
    let ignore = false
    getMe()
      .then((me) => !ignore && setUser(me))
      // A 401 has already cleared the token in the API client. Any other error also means "not logged in".
      .catch(() => !ignore && setUser(null))
      .finally(() => !ignore && setStatus('ready'))
    return () => {
      ignore = true
    }
  }, [])

  // Any 401 from the API (expired or invalid token) logs out. <RequireAuth> then redirects to /login.
  useEffect(() => onUnauthorized(() => setUser(null)), [])

  const login = useCallback(async (email: string, password: string) => {
    const { access_token } = await loginRequest({ email, password })
    authToken.set(access_token)
    setUser(await getMe())
  }, [])

  const logout = useCallback(() => {
    authToken.clear()
    setUser(null)
  }, [])

  // Memoised so components using useAuth() don't re-render when AuthProvider re-renders for another reason.
  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout])

  return <AuthContext value={value}>{children}</AuthContext>
}

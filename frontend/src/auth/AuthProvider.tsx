import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMe, login as loginRequest } from '../api/auth'
import { authToken, onUnauthorized } from '../api/client'
import { queryKeys } from '../api/queryClient'
import { AuthContext, type AuthState } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  // The token only decides *whether* to ask /me. A lazy initial value reads localStorage once.
  const [hasToken, setHasToken] = useState(() => authToken.get() !== null)

  // Stay logged in across refreshes: a stored token is only trusted once /me accepts it.
  // TanStack Query replaces the useEffect + ignore flag + three useStates this used to need.
  const me = useQuery({ queryKey: queryKeys.me, queryFn: getMe, enabled: hasToken, staleTime: Infinity })

  const logout = useCallback(() => {
    authToken.clear()
    setHasToken(false)
    // Forget everything cached for this user, so the next one never sees their trainings.
    queryClient.clear()
  }, [queryClient])

  // Any 401 from the API (expired or invalid token) logs out. <RequireAuth> then redirects to /login.
  useEffect(() => onUnauthorized(logout), [logout])

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await loginRequest({ email, password })
      authToken.set(access_token)
      // Load /me into the cache before resolving, so the next page already has the user.
      await queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: getMe })
      setHasToken(true)
    },
    [queryClient],
  )

  const user = hasToken ? (me.data ?? null) : null
  const status: AuthState['status'] = hasToken && me.isPending ? 'checking' : 'ready'

  // Memoised so components using useAuth() don't re-render when AuthProvider re-renders for another reason.
  const value = useMemo(() => ({ user, status, login, logout }), [user, status, login, logout])

  return <AuthContext value={value}>{children}</AuthContext>
}

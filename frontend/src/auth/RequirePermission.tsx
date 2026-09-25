import type { ReactNode } from 'react'
import { NotAllowedPage } from '../pages/NotAllowedPage'
import type { Permission } from './permissions'
import { useAuth } from './useAuth'

// Shows "Not allowed" instead of the page, and keeps the URL, so it's clear which page was refused.
// Used inside <RequireAuth>, so there is always a user.
export function RequirePermission({ allow, children }: { allow: Permission; children: ReactNode }) {
  const { user } = useAuth()
  return user && allow(user) ? children : <NotAllowedPage />
}

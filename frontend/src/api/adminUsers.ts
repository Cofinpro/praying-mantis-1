import { api } from './client'
import type { components } from './schema'

export type UserAdmin = components['schemas']['UserAdminRead']
export type UserCreate = components['schemas']['UserCreate']
export type UserUpdate = components['schemas']['UserUpdate']

// All admin only (403 otherwise).
export const listAdminUsers = (search = '') =>
  api.get<UserAdmin[]>(search ? `/api/admin/users?${new URLSearchParams({ search })}` : '/api/admin/users')

export const getAdminUser = (id: number) => api.get<UserAdmin>(`/api/admin/users/${id}`)

// 409 email_taken · 422 on a field (team_lead_not_found, team_lead_cycle, short password…)
export const createUser = (body: UserCreate) => api.post<UserAdmin>('/api/admin/users', body)

// Only the fields that changed. team_lead_id: null removes the lead. 409 cannot_demote_self.
export const updateUser = (id: number, body: UserUpdate) => api.patch<UserAdmin>(`/api/admin/users/${id}`, body)

export const resetPassword = (id: number, password: string) =>
  api.post<void>(`/api/admin/users/${id}/password`, { password })

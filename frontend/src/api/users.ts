import { api } from './client'
import type { components } from './schema'

export type UserSummary = components['schemas']['UserSummary']

// Admin only. Matches part of a name or email, for pickers like the trainer field.
export const searchUsers = (search: string) =>
  api.get<UserSummary[]>(`/api/users?${new URLSearchParams({ search })}`)

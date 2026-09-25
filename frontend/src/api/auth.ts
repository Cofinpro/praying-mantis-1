import { api } from './client'
import type { components } from './schema'

export type LoginRequest = components['schemas']['LoginRequest']
export type TokenResponse = components['schemas']['TokenResponse']
export type CurrentUser = components['schemas']['CurrentUserRead']

// Anonymous: a 401 here is a wrong email or password, shown on the form, not a logout.
export const login = (body: LoginRequest) => api.post<TokenResponse>('/api/auth/login', body, { anonymous: true })

export const getMe = () => api.get<CurrentUser>('/api/auth/me')

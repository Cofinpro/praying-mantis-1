import { api } from './client'
import type { components } from './schema'

export type LoginRequest = components['schemas']['LoginRequest']
export type TokenResponse = components['schemas']['TokenResponse']
export type CurrentUser = components['schemas']['CurrentUserRead']

// Anonymous: a 401 here is a wrong email or password, shown on the form, not a logout.
export const login = (body: LoginRequest) => api.post<TokenResponse>('/api/auth/login', body, { anonymous: true })

export const getMe = () => api.get<CurrentUser>('/api/auth/me')

// Sets or replaces my picture (multipart, field "file"). Returns me with the new avatar_url.
// 422 avatar_type | avatar_too_large | avatar_not_image.
export function uploadAvatar(image: Blob) {
  const form = new FormData()
  form.append('file', image, 'avatar.jpg')
  return api.put<CurrentUser>('/api/me/avatar', form)
}

export const deleteAvatar = () => api.delete('/api/me/avatar')

// 422 current_password (wrong_password) or new_password (too short, same_password)
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post<void>('/api/me/password', { current_password: currentPassword, new_password: newPassword })

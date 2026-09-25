import { api } from './client'
import type { components } from './schema'

export type Notification = components['schemas']['NotificationRead']
export type NotificationList = components['schemas']['NotificationList']

export const listNotifications = () => api.get<NotificationList>('/api/notifications?limit=20')

export const markNotificationRead = (id: number) => api.post<void>(`/api/notifications/${id}/read`)

export const markAllNotificationsRead = () => api.post<void>('/api/notifications/read-all')

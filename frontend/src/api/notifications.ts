import { api } from './client'

// Hand-written until BE-4.1 adds these endpoints (then use components['schemas'][...] from schema.d.ts).
// Shapes from the agreed F4 contract in plan.md.
export type Notification = {
  id: number
  type: string
  message: string
  // An in-app path like "/trainings/12", or null when there's nothing to open
  link: string | null
  read: boolean
  created_at: string
}

export type NotificationList = { unread_count: number; items: Notification[] }

export const listNotifications = () => api.get<NotificationList>('/api/notifications?limit=20')

export const markNotificationRead = (id: number) => api.post<void>(`/api/notifications/${id}/read`)

export const markAllNotificationsRead = () => api.post<void>('/api/notifications/read-all')

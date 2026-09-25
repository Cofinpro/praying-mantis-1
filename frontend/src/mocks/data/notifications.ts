import type { Notification, NotificationList } from '../../api/notifications'

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

// A few notifications per seed user id, like the events in plan.md → F4.
const byUser: Record<number, Notification[]> = {
  2: [
    { id: 1, type: 'enrollment_requested', message: 'João Silva asked to join FastAPI in Practice', link: '/approvals', read: false, created_at: minutesAgo(12) },
    { id: 2, type: 'enrollment_requested', message: 'Marta Lopes asked to join SQL Performance', link: '/approvals', read: false, created_at: minutesAgo(95) },
    { id: 3, type: 'enrollment_withdrawn', message: 'Pedro Alves gave up his seat in React Basics', link: '/trainings/1', read: true, created_at: minutesAgo(60 * 26) },
  ],
  5: [
    { id: 6, type: 'seat_reminder', message: 'Reminder: your seat DKB-04 is booked for tomorrow', link: '/seats', read: false, created_at: minutesAgo(5) },
    { id: 4, type: 'enrollment_approved', message: 'Your request for React Basics was approved', link: '/trainings/1', read: false, created_at: minutesAgo(30) },
    { id: 5, type: 'training_changed', message: 'Git Beyond the Basics moved to a new time', link: '/trainings/7', read: true, created_at: minutesAgo(60 * 50) },
  ],
}

// GET /api/notifications?limit=20: newest first
export function listMockNotifications(userId: number, limit = 20): NotificationList {
  const items = [...(byUser[userId] ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return { unread_count: items.filter((n) => !n.read).length, items: items.slice(0, limit) }
}

export function markMockRead(userId: number, id: number | 'all') {
  for (const n of byUser[userId] ?? []) {
    if (id === 'all' || n.id === id) n.read = true
  }
}

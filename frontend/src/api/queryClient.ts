import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './client'

// One cache for the whole app, like a Pinia store shared by every component that reads server data.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Retrying a 4xx won't change the answer (401, 403, 404). Network hiccups and 5xx get one retry.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 1,
      },
    },
  })
}

// Query keys: one place, so a component that reads trainings and one that invalidates them agree.
export const queryKeys = {
  me: ['me'] as const,
  trainings: ['trainings'] as const,
  trainingList: (level: string | null) => ['trainings', 'list', { level }] as const,
  trainingDetail: (id: number) => ['trainings', 'detail', id] as const,
  trainingFeedback: (id: number) => ['trainings', 'feedback', id] as const,
  // Under 'trainings' on purpose: joining, withdrawing or a decision invalidates ['trainings'], and the
  // profile's sections change with them.
  myEnrollments: ['trainings', 'mine'] as const,
  approvals: ['approvals'] as const,
  notifications: ['notifications'] as const,
  // One cache entry per day: switching back to a date you've seen is instant
  seats: (date: string) => ['seats', date] as const,
  myReservations: ['reservations', 'me'] as const,
  adminUsers: ['admin', 'users'] as const,
  adminUserList: (search: string) => ['admin', 'users', 'list', search] as const,
  adminUser: (id: number) => ['admin', 'users', 'detail', id] as const,
}

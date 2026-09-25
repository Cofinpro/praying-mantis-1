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
}

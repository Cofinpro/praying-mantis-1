import type { Level, TrainingRead, TrainingSummary } from '../../api/trainings'
import { findSeedUserById } from './users'

// Dates relative to today, so the mocks (and the live site on mocks) always have upcoming trainings.
function daysFromNow(days: number, hour: number, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

type MockTraining = Omit<TrainingRead, 'my_enrollment_status'> & {
  // user id → that user's enrollment status, standing in for the enrollments table
  enrollments: Record<number, TrainingRead['my_enrollment_status']>
}

function training(
  id: number,
  name: string,
  [startDay, startHour, endHour]: [number, number, number],
  levels: Level[],
  trainer: { id: number } | { external: string | null },
  seats: [left: number, max: number],
  extra: Partial<MockTraining> = {},
): MockTraining {
  const user = 'id' in trainer ? findSeedUserById(trainer.id) : undefined
  return {
    id,
    name,
    description: `${name}: a hands-on session with exercises. Bring a laptop.`,
    starts_at: daysFromNow(startDay, startHour),
    ends_at: daysFromNow(startDay, endHour),
    levels,
    trainer: user ? { id: user.id, name: user.name } : null,
    external_trainer_name: 'external' in trainer ? trainer.external : null,
    max_seats: seats[1],
    seats_left: seats[0],
    cancelled: false,
    enrollments: {},
    ...extra,
  }
}

// Sofia (2), Tiago (3) and Inês (4) train; João (5) is junior, Marta (6) expert, Pedro (7) senior.
export const mockTrainings: MockTraining[] = [
  training(1, 'React Basics', [19, 9, 12], ['junior', 'expert'], { id: 2 }, [8, 12], {
    enrollments: { 5: 'approved' },
  }),
  training(2, 'FastAPI in Practice', [21, 14, 17], ['junior', 'senior'], { id: 3 }, [3, 10], {
    enrollments: { 5: 'pending', 7: 'approved' },
  }),
  training(3, 'SQL Performance', [25, 10, 12], ['expert', 'senior'], { external: 'Acme Academy' }, [12, 15]),
  training(4, 'Clean Architecture', [27, 9, 16], ['senior', 'architect'], { id: 4 }, [1, 8]),
  training(5, 'Effective Code Reviews', [35, 15, 16], ['junior', 'expert'], { id: 2 }, [0, 10]),
  training(6, 'Kubernetes 101', [33, 13, 17], ['junior', 'architect'], { external: 'CloudSkills' }, [20, 20], {
    cancelled: true,
  }),
  training(7, 'Git Beyond the Basics', [-20, 14, 16], ['junior', 'senior'], { id: 3 }, [2, 12], {
    enrollments: { 5: 'approved' },
  }),
]

export function toSummary({ enrollments, description: _description, ...training }: MockTraining, viewerId: number) {
  return { ...training, my_enrollment_status: enrollments[viewerId] ?? null } satisfies TrainingSummary
}

// Same rules as backend/app/services/trainings.py (see decisions.md → "Listing trainings").
export function listMockTrainings(viewer: { id: number; level: Level; is_admin: boolean }, level: Level | null) {
  const now = new Date().toISOString()
  return mockTrainings
    .filter((t) =>
      viewer.is_admin
        ? !level || t.levels.includes(level)
        : t.starts_at > now && !t.cancelled && t.levels.includes(viewer.level),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((t) => toSummary(t, viewer.id))
}

// GET /api/trainings/{id}: admins see any training; employees any for their level, even past or cancelled.
export function getMockTraining(viewer: { id: number; level: Level; is_admin: boolean }, id: number): TrainingRead | null {
  const training = mockTrainings.find((t) => t.id === id)
  if (!training || (!viewer.is_admin && !training.levels.includes(viewer.level))) {
    return null
  }
  return { ...toSummary(training, viewer.id), description: training.description }
}

import type { Level, TrainingRead, TrainingSummary } from '../../api/trainings'
import type { ApprovalItem, EnrollmentRead } from '../../api/enrollments'
import { canDecideFor, findSeedUserById } from './users'

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
  training(3, 'SQL Performance', [25, 10, 12], ['expert', 'senior'], { external: 'Acme Academy' }, [12, 15], {
    // Marta (Sofia's report), Pedro (Sofia's), Laura (Inês's), Rafael (no lead → admins)
    enrollments: { 6: 'pending', 7: 'pending', 14: 'pending', 15: 'pending' },
  }),
  training(4, 'Clean Architecture', [27, 9, 16], ['senior', 'architect'], { id: 4 }, [0, 8], {
    // Full: approving Bruno shows why it can't be done
    enrollments: { 11: 'pending' },
  }),
  training(5, 'Effective Code Reviews', [35, 15, 16], ['junior', 'expert'], { id: 2 }, [0, 10]),
  training(6, 'Kubernetes 101', [33, 13, 17], ['junior', 'architect'], { external: 'CloudSkills' }, [20, 20], {
    cancelled: true,
  }),
  training(7, 'Git Beyond the Basics', [-20, 14, 16], ['junior', 'senior'], { id: 3 }, [2, 12], {
    enrollments: { 5: 'approved' },
  }),
]

export function toSummary({ enrollments, description: _description, ...training }: MockTraining, viewerId: number) {
  const status = enrollments[viewerId] ?? null
  return {
    ...training,
    my_enrollment_status: status,
    my_enrollment_id: status ? training.id * 1000 + viewerId : null,
  } satisfies TrainingSummary
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

// PATCH /api/trainings/{id} and POST …/cancel. Like the backend, a cancelled training can't change.
export function updateMockTraining(id: number, changes: Partial<MockTraining>) {
  const training = mockTrainings.find((t) => t.id === id)
  if (!training) return 'not_found' as const
  if (training.cancelled) return 'cancelled' as const
  Object.assign(training, changes)
  return training
}

let nextEnrollmentId = 1000

// POST /api/trainings/{id}/enrollments, with BE-3.1's rules and error codes.
export function requestMockEnrollment(viewer: { id: number; level: Level }, trainingId: number) {
  const training = mockTrainings.find((t) => t.id === trainingId)
  if (!training) return { status: 404 as const, detail: 'Training not found' }
  if (!training.levels.includes(viewer.level)) return { status: 403 as const, detail: "This training isn't for your level" }
  const refuse = (code: string, message: string) => ({ status: 409 as const, detail: { code, message } })
  if (training.cancelled) return refuse('training_cancelled', 'This training is cancelled')
  if (training.starts_at <= new Date().toISOString()) return refuse('training_started', 'This training has already started')
  const current = training.enrollments[viewer.id]
  if (current === 'pending' || current === 'approved') return refuse('already_requested', "You've already requested this training")
  if (current === 'rejected') return refuse('request_rejected', 'Your request for this training was rejected')
  if (training.seats_left <= 0) return refuse('training_full', 'This training is full')
  training.enrollments[viewer.id] = 'pending'
  return {
    status: 201 as const,
    enrollment: {
      id: nextEnrollmentId++,
      training_id: trainingId,
      user_id: viewer.id,
      status: 'pending' as const,
      decision_comment: null,
      requested_at: new Date().toISOString(),
      decided_at: null,
    },
  }
}

// Mock enrollment ids are derived, so the map above stays the only store: training 2 + user 5 → 2005.
const enrollmentId = (trainingId: number, userId: number) => trainingId * 1000 + userId
const REQUESTED_AT = new Date(Date.now() - 26 * 3600 * 1000).toISOString()

function mockEnrollment(trainingId: number, userId: number, comment: string | null = null): EnrollmentRead {
  const training = mockTrainings.find((t) => t.id === trainingId)!
  return {
    id: enrollmentId(trainingId, userId),
    training_id: trainingId,
    user_id: userId,
    status: (training.enrollments[userId] ?? 'pending') as EnrollmentRead['status'],
    decision_comment: comment,
    requested_at: REQUESTED_AT,
    decided_at: training.enrollments[userId] === 'pending' ? null : new Date().toISOString(),
  }
}

// GET /api/approvals
export function listMockApprovals(viewer: { id: number; email: string; is_admin: boolean }): ApprovalItem[] {
  return mockTrainings.flatMap((training) =>
    Object.entries(training.enrollments)
      .filter(([userId, status]) => status === 'pending' && canDecideFor(viewer, Number(userId)))
      .map(([userId]) => ({
        enrollment: mockEnrollment(training.id, Number(userId)),
        user: { id: Number(userId), name: findSeedUserById(Number(userId))?.name ?? 'Unknown' },
        training: toSummary(training, Number(userId)),
      })),
  )
}

// POST /api/enrollments/{id}/approve | reject, with BE-3.2's rules.
export function decideMockEnrollment(
  viewer: { id: number; email: string; is_admin: boolean },
  id: number,
  decision: 'approved' | 'rejected',
  comment: string | null,
) {
  const training = mockTrainings.find((t) => t.id === Math.floor(id / 1000))
  const userId = id % 1000
  if (!training || !(userId in training.enrollments)) return { status: 404 as const, detail: 'Enrollment not found' }
  if (!canDecideFor(viewer, userId)) return { status: 403 as const, detail: 'Not one of your reports' }
  const refuse = (code: string, message: string) => ({ status: 409 as const, detail: { code, message } })
  if (training.enrollments[userId] !== 'pending') return refuse('not_pending', 'This request was already decided')
  if (decision === 'approved') {
    if (training.seats_left <= 0) return refuse('training_full', 'This training is full')
    training.seats_left -= 1
  }
  training.enrollments[userId] = decision
  return { status: 200 as const, enrollment: mockEnrollment(training.id, userId, comment) }
}

// POST /api/enrollments/{id}/withdraw, with BE-3.3's rules.
export function withdrawMockEnrollment(viewer: { id: number }, id: number) {
  const training = mockTrainings.find((t) => t.id === Math.floor(id / 1000))
  const userId = id % 1000
  if (!training || !(userId in training.enrollments)) return { status: 404 as const, detail: 'Enrollment not found' }
  if (userId !== viewer.id) return { status: 403 as const, detail: 'Not your enrollment' }
  const refuse = (code: string, message: string) => ({ status: 409 as const, detail: { code, message } })
  if (training.starts_at <= new Date().toISOString()) return refuse('training_started', 'This training has already started')
  const status = training.enrollments[userId]
  if (status !== 'pending' && status !== 'approved') return refuse('not_withdrawable', 'Only pending or approved requests can be withdrawn')
  if (status === 'approved') training.seats_left += 1
  training.enrollments[userId] = 'withdrawn'
  return { status: 200 as const, enrollment: mockEnrollment(training.id, userId) }
}

// GET /api/me/enrollments, with the F5 definitions (Q10: completed = approved + ended + not cancelled).
export function listMockMyEnrollments(viewerId: number) {
  const now = new Date().toISOString()
  const mine = mockTrainings
    .filter((t) => t.enrollments[viewerId])
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const status = (t: MockTraining) => t.enrollments[viewerId]
  return {
    upcoming: mine.filter((t) => status(t) === 'approved' && t.ends_at > now).map((t) => toSummary(t, viewerId)),
    pending: mine.filter((t) => status(t) === 'pending' && !t.cancelled).map((t) => toSummary(t, viewerId)),
    completed: mine
      .filter((t) => status(t) === 'approved' && t.ends_at <= now && !t.cancelled)
      .reverse()
      .map((t) => toSummary(t, viewerId)),
  }
}

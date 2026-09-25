import type { PersonReportRow, TrainingReportRow } from '../../api/reports'
import { mockRatings, mockTrainings } from './trainings'
import { listMockUsers } from './users'

const hours = (t: { starts_at: string; ends_at: string }) => (Date.parse(t.ends_at) - Date.parse(t.starts_at)) / 3_600_000

// GET /api/admin/reports/trainings: newest first, `from` / `to` on the UTC start day, both included
export function mockTrainingReport(from: string | null, to: string | null): TrainingReportRow[] {
  return mockTrainings
    .filter((t) => (!from || t.starts_at.slice(0, 10) >= from) && (!to || t.starts_at.slice(0, 10) <= to))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map((t) => {
      const statuses = Object.values(t.enrollments)
      const count = (status: string) => statuses.filter((s) => s === status).length
      const { average, count: ratings } = mockRatings(t.id)
      return {
        id: t.id,
        name: t.name,
        starts_at: t.starts_at,
        ends_at: t.ends_at,
        cancelled: t.cancelled,
        trainer: t.trainer?.name ?? t.external_trainer_name ?? 'External',
        levels: t.levels,
        max_seats: t.max_seats,
        waitlisted: count('waitlisted'),
        pending: count('pending'),
        // The mocks' seats_left is stored, not derived: seats taken = the approved ones
        approved: t.max_seats - t.seats_left,
        rejected: count('rejected'),
        withdrawn: count('withdrawn'),
        average_rating: average,
        rating_count: ratings,
      }
    })
}

// GET /api/admin/reports/people: everyone by name; completed = approved, ended, not cancelled
export function mockPeopleReport(): PersonReportRow[] {
  const now = new Date().toISOString()
  return listMockUsers().map((user) => {
    const approved = mockTrainings.filter((t) => t.enrollments[user.id] === 'approved' && !t.cancelled)
    const completed = approved.filter((t) => t.ends_at <= now)
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      client: user.client,
      level: user.level,
      team_lead: user.team_lead?.name ?? null,
      completed: completed.length,
      completed_hours: Math.round(completed.reduce((sum, t) => sum + hours(t), 0) * 10) / 10,
      last_completed_at: completed.map((t) => t.ends_at).sort().at(-1) ?? null,
      upcoming: approved.length - completed.length,
    }
  })
}

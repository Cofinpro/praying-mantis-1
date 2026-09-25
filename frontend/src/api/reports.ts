import { api } from './client'
import type { components } from './schema'

export type TrainingReportRow = components['schemas']['TrainingReportRow']
export type PersonReportRow = components['schemas']['PersonReportRow']

// Admins only. `from` / `to` are days (YYYY-MM-DD, both included) on the training's start, in UTC.
export function getTrainingReport(range: { from: string; to: string }) {
  const params = new URLSearchParams(Object.entries(range).filter(([, day]) => day))
  const query = params.size ? `?${params}` : ''
  return api.get<TrainingReportRow[]>(`/api/admin/reports/trainings${query}`)
}

// Admins only. Everyone, by name, with completed trainings (approved, ended, not cancelled) and upcoming ones.
export const getPeopleReport = () => api.get<PersonReportRow[]>('/api/admin/reports/people')

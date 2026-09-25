import { api } from './client'
import type { components } from './schema'

export type EnrollmentRead = components['schemas']['EnrollmentRead']
export type EnrollmentStatus = components['schemas']['EnrollmentStatus']

// Creates a pending enrollment. 403 = not for your level; 409 codes in enrollments/messages.ts.
export const requestToJoin = (trainingId: number) =>
  api.post<EnrollmentRead>(`/api/trainings/${trainingId}/enrollments`)

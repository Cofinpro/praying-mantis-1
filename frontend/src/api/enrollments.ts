import { api } from './client'
import type { components } from './schema'

export type EnrollmentRead = components['schemas']['EnrollmentRead']
export type EnrollmentStatus = components['schemas']['EnrollmentStatus']

// Creates a pending enrollment. 403 = not for your level; 409 codes in enrollments/messages.ts.
export const requestToJoin = (trainingId: number) =>
  api.post<EnrollmentRead>(`/api/trainings/${trainingId}/enrollments`)

// One pending request: who asked, and for which training
export type ApprovalItem = components['schemas']['ApprovalRead']

// Pending requests I can decide: my reports', plus (for admins) users without a team lead.
export const listApprovals = () => api.get<ApprovalItem[]>('/api/approvals')

// Both take an optional comment, stored as the enrollment's decision_comment. 409 training_full / not_pending.
export const approveEnrollment = (id: number, comment: string | null) =>
  api.post<EnrollmentRead>(`/api/enrollments/${id}/approve`, { comment })

export const rejectEnrollment = (id: number, comment: string | null) =>
  api.post<EnrollmentRead>(`/api/enrollments/${id}/reject`, { comment })

// Only my own, only while pending or approved, only before the training starts (409 training_started).
export const withdrawEnrollment = (id: number) => api.post<EnrollmentRead>(`/api/enrollments/${id}/withdraw`)

// upcoming = approved and not ended; pending = waiting for a decision; completed = approved, ended, not cancelled.
export type MyEnrollments = components['schemas']['MyEnrollments']

export const getMyEnrollments = () => api.get<MyEnrollments>('/api/me/enrollments')

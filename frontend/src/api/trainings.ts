import { api } from './client'
import type { components } from './schema'

export type Level = components['schemas']['Level']
export type TrainingCreate = components['schemas']['TrainingCreate']
export type TrainingRead = components['schemas']['TrainingRead'] & { my_enrollment_id?: number | null }
// `my_enrollment_id` is hand-written until BE-3.3 adds it (see decisions.md → "Withdraw"): the withdraw
// endpoint needs the enrollment's id, and the training is where the page gets my enrollment from.
export type TrainingSummary = components['schemas']['TrainingSummary'] & { my_enrollment_id?: number | null }
export type TrainingUpdate = components['schemas']['TrainingUpdate']

// Employees get upcoming trainings for their own level. Admins get every training, optionally for one
// level (the backend ignores `level` for everyone else).
export const listTrainings = (level: Level | null) =>
  api.get<TrainingSummary[]>(level ? `/api/trainings?${new URLSearchParams({ level })}` : '/api/trainings')

// Admin only. Times go in as UTC ISO strings; 422 = validation errors (see trainings/trainingForm.ts).
export const createTraining = (body: TrainingCreate) => api.post<TrainingRead>('/api/trainings', body)

// 404 for a missing id and for a training that isn't for the viewer's level (the backend doesn't say which).
export const getTraining = (id: number) => api.get<TrainingRead>(`/api/trainings/${id}`)

// Admin only. Send just the fields that changed; `null` clears the trainer fields. 409 if cancelled.
export const updateTraining = (id: number, body: TrainingUpdate) => api.patch<TrainingRead>(`/api/trainings/${id}`, body)

// Admin only. A soft delete. 409 `training_started` once it has begun, `training_cancelled` if already cancelled.
export const cancelTraining = (id: number) => api.post<TrainingRead>(`/api/trainings/${id}/cancel`)

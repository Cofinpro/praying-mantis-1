import { api } from './client'
import type { components } from './schema'

export type Level = components['schemas']['Level']
export type TrainingCreate = components['schemas']['TrainingCreate']
export type TrainingRead = components['schemas']['TrainingRead']
export type TrainingSummary = components['schemas']['TrainingSummary']

// Employees get upcoming trainings for their own level. Admins get every training, optionally for one
// level (the backend ignores `level` for everyone else).
export const listTrainings = (level: Level | null) =>
  api.get<TrainingSummary[]>(level ? `/api/trainings?${new URLSearchParams({ level })}` : '/api/trainings')

// Admin only. Times go in as UTC ISO strings; 422 = validation errors (see trainings/trainingForm.ts).
export const createTraining = (body: TrainingCreate) => api.post<TrainingRead>('/api/trainings', body)

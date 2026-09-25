import { api } from './client'
import type { components } from './schema'

export type Level = components['schemas']['Level']
export type TrainingCreate = components['schemas']['TrainingCreate']
export type TrainingRead = components['schemas']['TrainingRead']

// Admin only. Times go in as UTC ISO strings; 422 = validation errors (see trainings/trainingForm.ts).
export const createTraining = (body: TrainingCreate) => api.post<TrainingRead>('/api/trainings', body)

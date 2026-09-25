import { api } from './client'
import type { components } from './schema'

export type Material = components['schemas']['MaterialRead']

const base = (trainingId: number) => `/api/trainings/${trainingId}/materials`

// Everyone who can see the training. Oldest first.
export const listMaterials = (trainingId: number) => api.get<Material[]>(base(trainingId))

// Admins and the trainer. 422 types: material_type | material_too_large | material_mismatch | material_empty | material_name;
// 409 codes: training_cancelled | too_many_materials. Everyone enrolled gets a notification.
export function uploadMaterial(trainingId: number, file: File) {
  const form = new FormData()
  form.append('file', file, file.name)
  return api.post<Material>(base(trainingId), form)
}

export const downloadMaterial = (trainingId: number, materialId: number) =>
  api.blob(`${base(trainingId)}/${materialId}/file`)

export const deleteMaterial = (trainingId: number, materialId: number) =>
  api.delete(`${base(trainingId)}/${materialId}`)

import type { Material } from '../../api/materials'
import { findSeedUserById } from './users'

// Files while the mocks run: training id → its materials, each with its bytes
type Stored = { material: Material; data: Uint8Array<ArrayBuffer> }
const store = new Map<number, Stored[]>()
let nextId = 1

const MAX_BYTES = 10 * 1024 * 1024
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
}

export const listMockMaterials = (trainingId: number) => (store.get(trainingId) ?? []).map((s) => s.material)

export const getMockMaterial = (trainingId: number, id: number) => store.get(trainingId)?.find((s) => s.material.id === id)

// POST …/materials: the backend's 422 types, but only checking the extension and size (not the bytes)
export function addMockMaterial(trainingId: number, uploaderId: number, filename: string, data: Uint8Array<ArrayBuffer>) {
  const contentType = TYPES[filename.split('.').pop()?.toLowerCase() ?? '']
  const invalid = (type: string, msg: string) => ({ status: 422 as const, detail: [{ type, loc: ['body', 'file'], msg }] })
  if (!contentType) return invalid('material_type', 'Use one of these file types: .docx, .jpeg, .jpg, .md, .pdf, .png, .pptx, .txt, .xlsx, .zip')
  if (data.length === 0) return invalid('material_empty', 'The file is empty')
  if (data.length > MAX_BYTES) return invalid('material_too_large', 'The file is too large (max 10 MB)')
  const uploader = findSeedUserById(uploaderId)
  const material: Material = {
    id: nextId++,
    filename,
    content_type: contentType,
    size: data.length,
    uploaded_by: uploader ? { id: uploader.id, name: uploader.name } : null,
    created_at: new Date().toISOString(),
  }
  store.set(trainingId, [...(store.get(trainingId) ?? []), { material, data }])
  return { status: 201 as const, material }
}

export function deleteMockMaterial(trainingId: number, id: number) {
  const files = store.get(trainingId) ?? []
  if (!files.some((s) => s.material.id === id)) return false
  store.set(trainingId, files.filter((s) => s.material.id !== id))
  return true
}

// Demo files: a tiny text "PDF" is enough to show a download
const encode = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>
addMockMaterial(1, 2, 'React Basics – slides.pdf', encode('%PDF-1.7\nReact Basics slides (mock)\n'))
addMockMaterial(1, 2, 'Exercises.md', encode('# Exercises\n\n1. Build a counter with useState.\n'))
addMockMaterial(7, 3, 'Git cheatsheet.pdf', encode('%PDF-1.7\nGit cheatsheet (mock)\n'))

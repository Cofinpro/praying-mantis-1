import { api } from './client'
import type { components } from './schema'

// Hand-written until BE-6.1 / BE-6.2 add these endpoints (F6 contract in plan.md).
export type Client = components['schemas']['Client']

export type Seat = {
  id: number
  label: string // e.g. "DKB-03"
  zone: Client
  // Grid position inside the zone, 0-based (see decisions.md → "Seat map")
  pos_x: number
  pos_y: number
  status: 'free' | 'taken' | 'mine'
  taken_by: { id: number; name: string } | null
  // Free, in my client's zone, and the date is allowed
  bookable: boolean
}

// `date` is a local calendar day, "YYYY-MM-DD". 422 for past days, weekends or more than 2 weeks ahead.
export const listSeats = (date: string) => api.get<Seat[]>(`/api/seats?${new URLSearchParams({ date })}`)

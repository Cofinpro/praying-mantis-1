import { api } from './client'
import type { components } from './schema'

export type Client = components['schemas']['Client']

// One seat on the map for a day. pos_x / pos_y are 0-based inside the zone (see decisions.md → "Seat map").
// bookable = free, in my client's zone, and the date is allowed.
export type Seat = components['schemas']['SeatStatus']

// `date` is a local calendar day, "YYYY-MM-DD". 422 for past days, weekends or more than 2 weeks ahead.
export const listSeats = (date: string) => api.get<Seat[]>(`/api/seats?${new URLSearchParams({ date })}`)

// { id, date: "YYYY-MM-DD", seat: { id, label, zone } }: enough for "My reservations" without another request
export type ReservationRead = components['schemas']['ReservationRead']

// Reserves `seat_id` for `date`. If I already have a seat that day, the backend moves it.
// 403 another client's zone · 409 seat_taken · 422 bad date.
export const reserveSeat = (seatId: number, date: string) =>
  api.post<ReservationRead>('/api/reservations', { seat_id: seatId, date })

// My reservations from today on, soonest first.
export const listMyReservations = () => api.get<ReservationRead[]>('/api/reservations/me')

// 204. 403 not mine · 409 reservation_in_past.
export const cancelReservation = (id: number) => api.delete(`/api/reservations/${id}`)

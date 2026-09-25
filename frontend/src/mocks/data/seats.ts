import type { Client, Seat } from '../../api/seats'
import { fromDayString, toDayString, twoWeeks } from '../../lib/days'
import { mockAvatarUrl } from './avatars'
import { findSeedUserById } from './users'

// One zone per client, 10 seats each in 2 rows of 5: DKB-01 … UNION-10 (BE-6.1 seeds the same shape).
const ZONES: Client[] = ['DKB', 'Deka', 'VV', 'DBIS', 'UNION']

const layout = ZONES.flatMap((zone, z) =>
  Array.from({ length: 10 }, (_, i) => ({
    id: z * 100 + i + 1,
    label: `${zone.toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
    zone,
    pos_x: i % 5,
    pos_y: Math.floor(i / 5),
  })),
)

// reservations[day][seatId] = userId. Some seats are taken by colleagues on every bookable day.
const reservations: Record<string, Record<number, number>> = {}
function reservationsFor(day: string) {
  if (!reservations[day]) {
    const n = fromDayString(day).getDate()
    reservations[day] = { 3: 6, 4: 7, [(n % 5) + 6]: 8, 102: 9, 205: 11, 301: 14, 408: 12 }
  }
  return reservations[day]
}

// GET /api/seats?date=, with BE-6.2's date rules (422) and one reservation per person per day.
export function listMockSeats(viewer: { id: number; client: Client }, day: string) {
  if (!twoWeeks().some((d) => d.day === day && d.bookable)) {
    return { status: 422 as const, detail: [{ loc: ['query', 'date'], msg: 'Pick a weekday within the next two weeks' }] }
  }
  const taken = reservationsFor(day)
  const seats: Seat[] = layout.map((seat) => {
    const userId = taken[seat.id]
    const user = userId ? findSeedUserById(userId) : undefined
    const status = userId === viewer.id ? 'mine' : userId ? 'taken' : 'free'
    return {
      ...seat,
      status,
      taken_by: status === 'taken' && user ? { id: user.id, name: user.name, avatar_url: mockAvatarUrl(user.id) } : null,
      bookable: status === 'free' && seat.zone === viewer.client,
    }
  })
  return { status: 200 as const, seats }
}

let nextReservationId = 1
// reservation id → [day, seatId], so GET /me and DELETE can find reservations made through the mocks
const reservationIds: Record<number, [string, number]> = {}

// POST /api/reservations, with BE-6.3's rules: my client's zone only, a valid day, one seat per person per
// day (an existing one is moved), and 409 seat_taken when someone else has it.
export function reserveMockSeat(viewer: { id: number; client: Client }, seatId: number, day: string) {
  const seat = layout.find((s) => s.id === seatId)
  if (!seat) return { status: 404 as const, detail: 'Seat not found' }
  if (!twoWeeks().some((d) => d.day === day && d.bookable)) {
    return { status: 422 as const, detail: [{ loc: ['body', 'date'], msg: 'Pick a weekday within the next two weeks' }] }
  }
  if (seat.zone !== viewer.client) return { status: 403 as const, detail: "This seat is in another client's zone" }
  const taken = reservationsFor(day)
  if (taken[seatId] && taken[seatId] !== viewer.id) {
    return { status: 409 as const, detail: { code: 'seat_taken', message: 'This seat was just taken' } }
  }
  for (const [id, userId] of Object.entries(taken)) {
    if (userId === viewer.id) delete taken[Number(id)]
  }
  taken[seatId] = viewer.id
  const id = nextReservationId++
  reservationIds[id] = [day, seatId]
  return { status: 201 as const, reservation: { id, date: day, seat: { id: seat.id, label: seat.label, zone: seat.zone } } }
}

// GET /api/reservations/me: the viewer's reservations from today on, soonest first.
export function listMockMyReservations(viewerId: number) {
  const today = toDayString(new Date())
  return Object.entries(reservationIds)
    .filter(([, [day, seatId]]) => day >= today && reservationsFor(day)[seatId] === viewerId)
    .map(([id, [day, seatId]]) => {
      const seat = layout.find((s) => s.id === seatId)!
      return { id: Number(id), date: day, seat: { id: seat.id, label: seat.label, zone: seat.zone } }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

// DELETE /api/reservations/{id}
export function cancelMockReservation(viewerId: number, id: number) {
  const found = reservationIds[id]
  if (!found) return { status: 404 as const, detail: 'Reservation not found' }
  const [day, seatId] = found
  if (reservationsFor(day)[seatId] !== viewerId) return { status: 403 as const, detail: 'Not yours' }
  delete reservationsFor(day)[seatId]
  delete reservationIds[id]
  return { status: 204 as const }
}


import type { Client, Seat } from '../../api/seats'
import { fromDayString, twoWeeks } from '../../lib/days'
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
      taken_by: status === 'taken' && user ? { id: user.id, name: user.name } : null,
      bookable: status === 'free' && seat.zone === viewer.client,
    }
  })
  return { status: 200 as const, seats }
}

export { reservationsFor }

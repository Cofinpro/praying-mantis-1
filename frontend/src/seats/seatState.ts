import type { Seat } from '../api/seats'

export type SeatState = 'free' | 'taken' | 'mine' | 'unavailable'

// The four states from the design. "unavailable" = another client's zone.
export function seatState(seat: Seat, myZone: string): SeatState {
  if (seat.status === 'mine') return 'mine'
  if (seat.status === 'taken') return 'taken'
  return seat.zone === myZone ? 'free' : 'unavailable'
}

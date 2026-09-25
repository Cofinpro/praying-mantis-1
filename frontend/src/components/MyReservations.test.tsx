import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReservationRead, Seat } from '../api/seats'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

// Saturday 10 Oct 2026 (Lisbon): the map opens on Monday 12 Oct.
const SATURDAY = new Date('2026-10-10T09:00:00Z')

const reservation = (id: number, date: string, label: string): ReservationRead => ({
  id,
  date,
  seat: { id: id * 10, label, zone: 'DKB' },
})

// A stateful backend: my reservations, and Monday's map where DKB-03 is mine until I cancel it.
function serveSeats(mine: ReservationRead[]) {
  let reservations = mine
  let mondaySeat: Seat = { id: 30, label: 'DKB-03', zone: 'DKB', pos_x: 0, pos_y: 0, status: 'mine', taken_by: null, bookable: false }
  const deleted: number[] = []
  server.use(
    http.get('*/api/seats', () => HttpResponse.json([mondaySeat])),
    http.get('*/api/reservations/me', () => HttpResponse.json(reservations)),
    http.delete('*/api/reservations/:id', ({ params }) => {
      deleted.push(Number(params.id))
      reservations = reservations.filter((r) => r.id !== Number(params.id))
      mondaySeat = { ...mondaySeat, status: 'free', bookable: true }
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return deleted
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: SATURDAY })
})

afterEach(() => {
  vi.useRealTimers()
})

async function openSeats() {
  await storeLoginToken('joao@cofinpro.pt')
  renderRoute('/seats')
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

const list = () => within(screen.getByRole('region', { name: 'My reservations' }))

describe('my reservations', () => {
  it('lists my upcoming reservations under the map, sorted by date', async () => {
    serveSeats([reservation(2, '2026-10-14', 'DKB-05'), reservation(1, '2026-10-12', 'DKB-03')])
    await openSeats()

    await screen.findByRole('button', { name: 'Cancel DKB-03 on Mon 12 Oct' })
    expect(list().getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Mon 12 Oct · DKB-03Cancel',
      'Wed 14 Oct · DKB-05Cancel',
    ])
  })

  it('cancels after confirming, and the seat turns white on the map', async () => {
    const deleted = serveSeats([reservation(1, '2026-10-12', 'DKB-03')])
    const user = await openSeats()
    await screen.findByRole('button', { name: 'DKB-03, your seat' })

    await user.click(await screen.findByRole('button', { name: 'Cancel DKB-03 on Mon 12 Oct' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel DKB-03 on Mon 12 Oct?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel reservation' }))

    expect(await screen.findByText('No upcoming reservations. Pick a free seat on the map.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'DKB-03, free' })).toBeInTheDocument()
    expect(deleted).toEqual([1])
  })

  it('keeps the reservation when I change my mind', async () => {
    const deleted = serveSeats([reservation(1, '2026-10-12', 'DKB-03')])
    const user = await openSeats()

    await user.click(await screen.findByRole('button', { name: 'Cancel DKB-03 on Mon 12 Oct' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep it' }))

    expect(list().getByRole('button', { name: 'Cancel DKB-03 on Mon 12 Oct' })).toBeInTheDocument()
    expect(deleted).toEqual([])
  })
})

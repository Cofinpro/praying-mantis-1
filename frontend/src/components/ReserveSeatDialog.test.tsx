import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Seat } from '../api/seats'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

// Saturday 10 Oct 2026 (Lisbon): the page opens on Monday 12 Oct.
const SATURDAY = new Date('2026-10-10T09:00:00Z')

function seat(id: number, label: string, x: number, extra: Partial<Seat> = {}): Seat {
  return { id, label, zone: 'DKB', pos_x: x, pos_y: 0, status: 'free', taken_by: null, bookable: true, ...extra }
}

// A small stateful seats backend for one day: POST changes what GET returns next.
function serveSeats(initial: Seat[], onReserve?: (body: { seat_id: number; date: string }) => Response | undefined) {
  let seats = initial
  const posts: { seat_id: number; date: string }[] = []
  server.use(
    http.get('*/api/seats', () => HttpResponse.json(seats)),
    http.post('*/api/reservations', async ({ request }) => {
      const body = (await request.json()) as { seat_id: number; date: string }
      posts.push(body)
      const override = onReserve?.(body)
      if (override) return override
      seats = seats.map((s) =>
        s.id === body.seat_id
          ? { ...s, status: 'mine', bookable: false }
          : s.status === 'mine'
            ? { ...s, status: 'free', bookable: true }
            : s,
      )
      return HttpResponse.json({ id: 1, date: body.date, seat: { id: body.seat_id, label: 'x', zone: 'DKB' } }, { status: 201 })
    }),
  )
  return {
    posts,
    takeFirstSeat: () => {
      seats = seats.map((s) => (s.id === 1 ? { ...s, status: 'taken', taken_by: { id: 6, name: 'Marta Lopes' }, bookable: false } : s))
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: SATURDAY })
})

afterEach(() => {
  vi.useRealTimers()
})

async function openSeats() {
  await storeLoginToken('joao@preyingmantis.test')
  renderRoute('/seats')
  await screen.findByRole('button', { name: /^DKB-01/ })
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
}

describe('reserve a seat', () => {
  it('asks "Reserve DKB-01 for Mon 12 Oct?", then the seat becomes mine', async () => {
    const { posts } = serveSeats([seat(1, 'DKB-01', 0), seat(2, 'DKB-02', 1)])
    const user = await openSeats()

    await user.click(screen.getByRole('button', { name: 'DKB-01, free' }))
    const dialog = screen.getByRole('dialog', { name: 'Reserve DKB-01 for Mon 12 Oct?' })
    await user.click(within(dialog).getByRole('button', { name: 'Reserve' }))

    expect(await screen.findByRole('button', { name: 'DKB-01, your seat' })).toBeInTheDocument()
    expect(screen.getByText(/Your seat on Mon 12 Oct/)).toHaveTextContent('DKB-01')
    expect(posts).toEqual([{ seat_id: 1, date: '2026-10-12' }])
  })

  it('offers to move when I already have a seat that day', async () => {
    serveSeats([seat(1, 'DKB-01', 0), seat(3, 'DKB-03', 2, { status: 'mine', bookable: false })])
    const user = await openSeats()

    await user.click(screen.getByRole('button', { name: 'DKB-01, free' }))
    const dialog = screen.getByRole('dialog', { name: 'Move your reservation from DKB-03 to DKB-01?' })
    await user.click(within(dialog).getByRole('button', { name: 'Move' }))

    expect(await screen.findByRole('button', { name: 'DKB-01, your seat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'DKB-03, free' })).toBeInTheDocument()
  })

  it('says "Sorry, this seat was just taken" on a 409 and refreshes the map', async () => {
    const backend = serveSeats([seat(1, 'DKB-01', 0)], () => {
      backend.takeFirstSeat()
      return HttpResponse.json({ detail: { code: 'seat_taken', message: 'Seat taken' } }, { status: 409 })
    })
    const user = await openSeats()

    await user.click(screen.getByRole('button', { name: 'DKB-01, free' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reserve' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Sorry, this seat was just taken.')
    expect(await screen.findByRole('button', { name: 'DKB-01, taken by Marta Lopes', hidden: true })).toBeInTheDocument()
  })

  it("doesn't open for seats I can't book", async () => {
    serveSeats([
      seat(1, 'DKB-01', 0, { status: 'taken', taken_by: { id: 6, name: 'Marta Lopes' }, bookable: false }),
      { ...seat(101, 'DEKA-01', 0), zone: 'Deka', bookable: false },
    ])
    const user = await openSeats()

    await user.click(screen.getByRole('button', { name: 'DKB-01, taken by Marta Lopes' }))
    await user.click(screen.getByRole('button', { name: "DEKA-01, another client's zone" }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

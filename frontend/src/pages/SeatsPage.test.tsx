import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Seat } from '../api/seats'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

// Saturday 10 Oct 2026, 10:00 in Lisbon: today is a weekend, so the default is Monday 12 Oct.
const SATURDAY = new Date('2026-10-10T09:00:00Z')

function seat(id: number, label: string, zone: Seat['zone'], x: number, y: number, extra: Partial<Seat> = {}): Seat {
  return { id, label, zone, pos_x: x, pos_y: y, status: 'free', taken_by: null, bookable: zone === 'DKB', ...extra }
}

const seats: Seat[] = [
  seat(1, 'DKB-01', 'DKB', 0, 0),
  seat(2, 'DKB-02', 'DKB', 1, 0, { status: 'taken', taken_by: { id: 6, name: 'Marta Lopes' }, bookable: false }),
  seat(3, 'DKB-03', 'DKB', 0, 1, { status: 'mine', bookable: false }),
  seat(101, 'DEKA-01', 'Deka', 0, 0, { bookable: false }),
]

// Serves `seats` for any date, and records which dates were asked for.
function serveSeats(body = seats) {
  const dates: string[] = []
  server.use(
    http.get('*/api/seats', ({ request }) => {
      dates.push(new URL(request.url).searchParams.get('date')!)
      return HttpResponse.json(body)
    }),
  )
  return dates
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: SATURDAY })
})

afterEach(() => {
  vi.useRealTimers()
})

async function openSeats() {
  await storeLoginToken('joao@cofinpro.pt') // DKB
  const view = renderRoute('/seats')
  await screen.findByRole('button', { name: 'DKB-01, free' })
  return view
}

describe('seat map', () => {
  it('has a two-week day picker: weekends and past days disabled, next weekday selected', async () => {
    const dates = serveSeats()
    await openSeats()

    const picker = screen.getByRole('group', { name: 'Day' })
    expect(within(picker).getByRole('button', { name: /Fri\s*9 Oct/ })).toBeDisabled() // past
    expect(within(picker).getByRole('button', { name: /Sat\s*10 Oct/ })).toBeDisabled() // today, a weekend
    expect(within(picker).getByRole('button', { name: /Mon\s*12 Oct/ })).toHaveAttribute('aria-pressed', 'true')
    expect(within(picker).getByRole('button', { name: /Tue\s*13 Oct/ })).toBeEnabled()
    expect(within(picker).getByRole('button', { name: /Sat\s*17 Oct/ })).toBeDisabled()
    expect(dates).toEqual(['2026-10-12'])
  })

  it('shows a legend with a label for every state', async () => {
    serveSeats()
    await openSeats()

    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Free',
      'Taken',
      'Yours',
      "Another client's zone",
    ])
  })

  it('groups seats by zone, and names each state for screen readers', async () => {
    serveSeats()
    await openSeats()

    const dkb = screen.getByRole('region', { name: 'DKB zone (yours)' })
    expect(within(dkb).getByRole('button', { name: 'DKB-01, free' })).toBeInTheDocument()
    expect(within(dkb).getByRole('button', { name: 'DKB-02, taken by Marta Lopes' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(dkb).getByRole('button', { name: 'DKB-03, your seat' })).toHaveAttribute('aria-pressed', 'true')
    const deka = screen.getByRole('region', { name: 'Deka zone' })
    expect(within(deka).getByRole('button', { name: "DEKA-01, another client's zone" })).toHaveAttribute('aria-disabled', 'true')
  })

  it('places seats on the grid from pos_x / pos_y', async () => {
    serveSeats()
    await openSeats()

    const cell = (name: string) => screen.getByRole('button', { name }).parentElement!
    expect(cell('DKB-02, taken by Marta Lopes')).toHaveStyle({ gridColumn: '2', gridRow: '1' })
    expect(cell('DKB-03, your seat')).toHaveStyle({ gridColumn: '1', gridRow: '2' })
  })

  it('describes a taken seat with a "Taken by …" tooltip that focus reaches', async () => {
    serveSeats()
    await openSeats()

    const taken = screen.getByRole('button', { name: 'DKB-02, taken by Marta Lopes' })
    expect(taken).toHaveAccessibleDescription('Taken by Marta Lopes')
    // aria-disabled, not disabled: a seat that can't be booked stays in the Tab order, so its tooltip is reachable
    expect(taken).not.toBeDisabled()
    taken.focus()
    expect(taken).toHaveFocus()
  })

  it('summarises my seat for the day, or that I have none', async () => {
    serveSeats()
    await openSeats()
    expect(screen.getByText(/Your seat on Mon 12 Oct/)).toHaveTextContent('Your seat on Mon 12 Oct: DKB-03')

    serveSeats(seats.map((s) => (s.status === 'mine' ? { ...s, status: 'free' } : s)))
    await userEvent.click(screen.getByRole('button', { name: /Tue\s*13 Oct/ }))
    expect(await screen.findByText('You have no seat on Tue 13 Oct yet.')).toBeInTheDocument()
  })

  it('caches each date: going back to a day shows it at once', async () => {
    serveSeats()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { router } = await openSeats()

    await user.click(screen.getByRole('button', { name: /Tue\s*13 Oct/ }))
    expect(router.state.location.search).toBe('?date=2026-10-13')
    await screen.findByRole('button', { name: 'DKB-01, free' })
    await user.click(screen.getByRole('button', { name: /Mon\s*12 Oct/ }))

    // No loading state: Monday's seats come straight from the cache (and refresh in the background)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'DKB-01, free' })).toBeInTheDocument()
  })
})

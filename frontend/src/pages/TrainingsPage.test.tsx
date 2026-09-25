import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { TrainingSummary } from '../api/trainings'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

const reactBasics: TrainingSummary = {
  id: 12,
  name: 'React Basics',
  // 08:00–11:00 UTC = 09:00–12:00 in Lisbon (tests run in Europe/Lisbon)
  starts_at: '2030-10-15T08:00:00Z',
  ends_at: '2030-10-15T11:00:00Z',
  levels: ['junior', 'expert'],
  trainer: { id: 2, name: 'Sofia Martins' },
  external_trainer_name: null,
  max_seats: 12,
  seats_left: 4,
  cancelled: false,
  my_enrollment_status: 'pending',
}

const sqlPerformance: TrainingSummary = {
  ...reactBasics,
  id: 13,
  name: 'SQL Performance',
  trainer: null,
  external_trainer_name: 'Acme Academy',
  levels: ['junior'],
  seats_left: 0,
  max_seats: 10,
  my_enrollment_status: null,
}

// Answers GET /api/trainings with `trainings`, and records the ?level= of every request.
function serveTrainings(trainings: TrainingSummary[]) {
  const levels: (string | null)[] = []
  server.use(
    http.get('*/api/trainings', ({ request }) => {
      levels.push(new URL(request.url).searchParams.get('level'))
      return HttpResponse.json(trainings)
    }),
  )
  return levels
}

async function renderAs(email: string, path = '/trainings') {
  await storeLoginToken(email)
  return renderRoute(path)
}

describe('training list', () => {
  it('shows a card per training with date, trainer, levels, seats and my status', async () => {
    serveTrainings([reactBasics, sqlPerformance])
    await renderAs('joao@preyingmantis.test')

    const card = (await screen.findByRole('heading', { name: 'React Basics' })).closest('article')!
    expect(within(card).getByText('Tue 15 Oct 2030 · 09:00–12:00')).toBeInTheDocument()
    expect(within(card).getByText('Trainer: Sofia Martins')).toBeInTheDocument()
    expect(within(within(card).getByRole('list', { name: 'Levels' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Junior',
      'Expert',
    ])
    expect(within(card).getByText('4 of 12 seats left')).toBeInTheDocument()
    expect(within(card).getByText('Pending')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'React Basics' })).toHaveAttribute('href', '/trainings/12')

    const external = screen.getByRole('heading', { name: 'SQL Performance' }).closest('article')!
    expect(within(external).getByText('External – Acme Academy')).toBeInTheDocument()
    expect(within(external).getByText('Full · 0 of 10 seats left')).toBeInTheDocument()
    expect(within(external).queryByText(/Pending|Approved|Rejected|Withdrawn/)).not.toBeInTheDocument()
  })

  it("shows the employee's own level next to the subtitle", async () => {
    serveTrainings([reactBasics])
    await renderAs('joao@preyingmantis.test')

    expect(await screen.findByText(/Upcoming trainings for your level/)).toHaveTextContent('Junior')
  })

  it('shows a loading state while the list loads', async () => {
    server.use(
      http.get('*/api/trainings', async () => {
        await delay(100)
        return HttpResponse.json([reactBasics])
      }),
    )
    await renderAs('joao@preyingmantis.test')

    expect(await screen.findByRole('status')).toHaveTextContent('Loading trainings…')
    expect(await screen.findByRole('heading', { name: 'React Basics' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no trainings for my level', async () => {
    serveTrainings([])
    await renderAs('joao@preyingmantis.test')

    expect(await screen.findByText('No upcoming trainings for your level yet')).toBeInTheDocument()
  })

  it('shows an error with a retry that loads the list again', async () => {
    let serverDown = true
    server.use(
      http.get('*/api/trainings', () =>
        serverDown ? HttpResponse.json({ detail: 'Boom' }, { status: 500 }) : HttpResponse.json([reactBasics]),
      ),
    )
    await renderAs('joao@preyingmantis.test')

    // A 5xx is retried once (after 1 s) before the error shows, so wait longer than findBy's default.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent("Couldn't load trainings")
    serverDown = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'React Basics' })).toBeInTheDocument()
  })
})

describe('level filter', () => {
  it('lets an admin filter by level, and keeps it in the URL', async () => {
    const requested = serveTrainings([reactBasics])
    const { router } = await renderAs('admin@preyingmantis.test')
    await screen.findByRole('heading', { name: 'React Basics' })

    await userEvent.selectOptions(screen.getByLabelText('Level'), 'Senior')

    expect(router.state.location.search).toBe('?level=senior')
    await waitFor(() => expect(requested).toContain('senior'))
    expect(requested[0]).toBeNull()
  })

  it('is not shown to employees', async () => {
    serveTrainings([reactBasics])
    await renderAs('joao@preyingmantis.test')
    await screen.findByRole('heading', { name: 'React Basics' })

    expect(screen.queryByLabelText('Level')).not.toBeInTheDocument()
  })
})

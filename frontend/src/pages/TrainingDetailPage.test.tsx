import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { TrainingRead } from '../api/trainings'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

const training: TrainingRead = {
  id: 12,
  name: 'React Basics',
  description: 'Hooks, state and effects.\nBring a laptop.',
  // 08:00–11:00 UTC = 09:00–12:00 in Lisbon (tests run in Europe/Lisbon)
  starts_at: '2030-10-15T08:00:00Z',
  ends_at: '2030-10-15T11:00:00Z',
  levels: ['junior', 'expert'],
  trainer: { id: 2, name: 'Sofia Martins' },
  external_trainer_name: null,
  max_seats: 12,
  seats_left: 4,
  cancelled: false,
  my_enrollment_status: 'approved',
}

function serveTraining(body: TrainingRead) {
  server.use(http.get('*/api/trainings/:id', () => HttpResponse.json(body)))
}

async function openAsEmployee(path: string) {
  await storeLoginToken('joao@cofinpro.pt')
  return renderRoute(path)
}

describe('training detail', () => {
  it('shows everything from the card, plus the description', async () => {
    serveTraining(training)
    await openAsEmployee('/trainings/12')

    expect(await screen.findByRole('heading', { name: 'React Basics', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Tue 15 Oct 2030 · 09:00–12:00')).toBeInTheDocument()
    expect(screen.getByText('Sofia Martins')).toBeInTheDocument()
    expect(screen.getByText('Junior')).toBeInTheDocument()
    expect(screen.getByText('Expert')).toBeInTheDocument()
    const panel = screen.getByRole('complementary', { name: 'Your place' })
    expect(within(panel).getByText('4 of 12 seats left')).toBeInTheDocument()
    expect(within(panel).getByText('Approved')).toBeInTheDocument()
    // The line break the admin typed is kept
    expect(screen.getByText(/Hooks, state and effects\./)).toHaveTextContent('Hooks, state and effects. Bring a laptop.')
  })

  it('shows an external trainer by name', async () => {
    serveTraining({ ...training, trainer: null, external_trainer_name: 'Acme Academy' })
    await openAsEmployee('/trainings/12')

    expect(await screen.findByText('External – Acme Academy')).toBeInTheDocument()
  })

  it('shows a banner and a disabled join button for a cancelled training', async () => {
    serveTraining({ ...training, cancelled: true, my_enrollment_status: null })
    await openAsEmployee('/trainings/12')

    expect(await screen.findByRole('alert')).toHaveTextContent('This training was cancelled')
    const panel = screen.getByRole('complementary', { name: 'Your place' })
    expect(within(panel).getByRole('button', { name: 'Cancelled' })).toBeDisabled()
  })

  it('shows "Not found" when the API answers 404', async () => {
    server.use(http.get('*/api/trainings/:id', () => HttpResponse.json({ detail: 'Training not found' }, { status: 404 })))
    await openAsEmployee('/trainings/999')

    expect(await screen.findByRole('heading', { name: 'Training not found' })).toBeInTheDocument()
  })

  it('shows "Not found" for an id that is not a number', async () => {
    await openAsEmployee('/trainings/abc')

    expect(await screen.findByRole('heading', { name: 'Training not found' })).toBeInTheDocument()
  })

  it('opens from a card in the list', async () => {
    serveTraining(training)
    server.use(http.get('*/api/trainings', () => HttpResponse.json([training])))
    const { router } = await openAsEmployee('/trainings')

    await userEvent.click(await screen.findByRole('link', { name: 'React Basics' }))

    expect(router.state.location.pathname).toBe('/trainings/12')
    expect(await screen.findByText('Bring a laptop.', { exact: false })).toBeInTheDocument()
  })
})

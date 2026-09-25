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
  description: 'Hooks, state and effects.',
  starts_at: '2030-10-15T08:00:00Z',
  ends_at: '2030-10-15T11:00:00Z',
  levels: ['junior'],
  trainer: { id: 2, name: 'Sofia Martins' },
  external_trainer_name: null,
  max_seats: 12,
  seats_left: 4,
  rating_count: 0,
  cancelled: false,
  my_enrollment_status: null,
}

async function openTraining(current: TrainingRead) {
  server.use(http.get('*/api/trainings/:id', () => HttpResponse.json(current)))
  await storeLoginToken('joao@cofinpro.pt')
  renderRoute('/trainings/12')
  return screen.findByRole('complementary', { name: 'Your place' })
}

describe('join button', () => {
  it.each([
    ['nothing yet', { my_enrollment_status: null }, 'Request to join', true],
    ['pending', { my_enrollment_status: 'pending' }, 'Pending approval', false],
    ['approved', { my_enrollment_status: 'approved' }, 'Enrolled ✓', false],
    ['approved and ended', { my_enrollment_status: 'approved', starts_at: '2020-01-01T09:00:00Z', ends_at: '2020-01-01T12:00:00Z' }, 'Completed ✓', false],
    ['rejected', { my_enrollment_status: 'rejected' }, 'Rejected', false],
    ['full', { seats_left: 0 }, 'Full', false],
    ['cancelled', { cancelled: true }, 'Cancelled', false],
    ['withdrawn earlier', { my_enrollment_status: 'withdrawn' }, 'Request to join', true],
  ])('reflects the state: %s', async (_, change, label, enabled) => {
    const panel = await openTraining({ ...training, ...change })

    const button = within(panel).getByRole('button', { name: label })
    if (enabled) expect(button).toBeEnabled()
    else expect(button).toBeDisabled()
  })

  it('requests to join, then shows Pending everywhere', async () => {
    let current = training
    server.use(
      http.get('*/api/trainings/:id', () => HttpResponse.json(current)),
      http.post('*/api/trainings/:id/enrollments', () => {
        current = { ...current, my_enrollment_status: 'pending' }
        return HttpResponse.json({ id: 1, training_id: 12, user_id: 5, status: 'pending' }, { status: 201 })
      }),
    )
    await storeLoginToken('joao@cofinpro.pt')
    renderRoute('/trainings/12')
    const panel = await screen.findByRole('complementary', { name: 'Your place' })

    await userEvent.click(within(panel).getByRole('button', { name: 'Request to join' }))

    expect(await within(panel).findByRole('button', { name: 'Pending approval' })).toBeDisabled()
    expect(within(panel).getByText('Pending', { selector: 'span' })).toBeInTheDocument()
  })

  it.each([
    [409, { code: 'training_full', message: 'This training is full' }, 'Sorry, this training just filled up.'],
    [409, { code: 'already_requested', message: '…' }, "You've already asked to join this training."],
    [409, { code: 'training_started', message: '…' }, 'This training has already started.'],
    [403, "This training isn't for your level", "This training isn't for your level"],
  ])('shows a clear message for a %i %j', async (status, detail, message) => {
    server.use(http.post('*/api/trainings/:id/enrollments', () => HttpResponse.json({ detail }, { status })))
    const panel = await openTraining(training)

    await userEvent.click(within(panel).getByRole('button', { name: 'Request to join' }))

    expect(await within(panel).findByRole('alert')).toHaveTextContent(message)
  })
})

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
  cancelled: false,
  my_enrollment_status: 'approved',
  my_enrollment_id: 77,
}

// A stateful backend for one training: withdrawing changes what GET returns next.
function serveTraining(initial: TrainingRead) {
  let current = initial
  const withdrawn: number[] = []
  server.use(
    http.get('*/api/trainings/:id', () => HttpResponse.json(current)),
    http.post('*/api/enrollments/:id/withdraw', ({ params }) => {
      withdrawn.push(Number(params.id))
      current = { ...current, my_enrollment_status: 'withdrawn', seats_left: current.seats_left + 1 }
      return HttpResponse.json({ id: Number(params.id), status: 'withdrawn' })
    }),
  )
  return withdrawn
}

async function openPanel() {
  await storeLoginToken('joao@preyingmantis.test')
  renderRoute('/trainings/12')
  return screen.findByRole('complementary', { name: 'Your place' })
}

describe('withdraw', () => {
  it.each([
    ['approved', {}, true],
    ['pending', { my_enrollment_status: 'pending' }, true],
    ['rejected', { my_enrollment_status: 'rejected' }, false],
    ['not enrolled', { my_enrollment_status: null, my_enrollment_id: null }, false],
    ['already started', { starts_at: '2020-01-01T09:00:00Z', ends_at: '2020-01-01T12:00:00Z' }, false],
  ])('is offered only while pending or approved and not started: %s', async (_, change, shown) => {
    serveTraining({ ...training, ...change })
    const panel = await openPanel()

    const button = within(panel).queryByRole('button', { name: 'Withdraw' })
    if (shown) expect(button).toBeInTheDocument()
    else expect(button).not.toBeInTheDocument()
  })

  it('asks for confirmation, then withdraws and frees the seat', async () => {
    const withdrawn = serveTraining(training)
    const user = userEvent.setup()
    const panel = await openPanel()

    await user.click(within(panel).getByRole('button', { name: 'Withdraw' }))
    const dialog = screen.getByRole('dialog', { name: 'Give up your seat?' })
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw' }))

    expect(await within(panel).findByRole('button', { name: 'Request to join' })).toBeEnabled()
    expect(within(panel).getByText('5 of 12 seats left')).toBeInTheDocument()
    expect(withdrawn).toEqual([77])
  })

  it('does nothing when the employee keeps it', async () => {
    const withdrawn = serveTraining({ ...training, my_enrollment_status: 'pending' })
    const user = userEvent.setup()
    const panel = await openPanel()

    await user.click(within(panel).getByRole('button', { name: 'Withdraw' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Withdraw your request?' })).getByRole('button', { name: 'Keep it' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(withdrawn).toEqual([])
  })

  it('explains a refusal inside the dialog', async () => {
    serveTraining(training)
    server.use(
      http.post('*/api/enrollments/:id/withdraw', () =>
        HttpResponse.json({ detail: { code: 'training_started', message: '…' } }, { status: 409 }),
      ),
    )
    const user = userEvent.setup()
    const panel = await openPanel()

    await user.click(within(panel).getByRole('button', { name: 'Withdraw' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Withdraw' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This training has already started.')
  })
})

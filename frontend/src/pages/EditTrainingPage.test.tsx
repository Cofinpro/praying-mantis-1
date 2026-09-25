import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TrainingRead, TrainingUpdate } from '../api/trainings'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

const training: TrainingRead = {
  id: 12,
  name: 'React Basics',
  description: 'Hooks, state and effects.',
  // 08:00–11:00 UTC = 09:00–12:00 in Lisbon (tests run in Europe/Lisbon)
  starts_at: '2030-10-15T08:00:00Z',
  ends_at: '2030-10-15T11:00:00Z',
  levels: ['junior', 'expert'],
  trainer: { id: 2, name: 'Sofia Martins' },
  external_trainer_name: null,
  max_seats: 12,
  seats_left: 12,
  rating_count: 0,
  cancelled: false,
  my_enrollment_status: null,
}

// A tiny stateful backend for one training: GET serves it, PATCH and cancel change it (and are recorded).
function serveTraining(initial: TrainingRead) {
  let current = initial
  const patches: TrainingUpdate[] = []
  let cancels = 0
  server.use(
    http.get('*/api/trainings/:id', () => HttpResponse.json(current)),
    http.patch('*/api/trainings/:id', async ({ request }) => {
      const body = (await request.json()) as TrainingUpdate
      patches.push(body)
      // Good enough for these tests: the fields they change are plain values
      current = { ...current, ...(body as Partial<TrainingRead>) }
      return HttpResponse.json(current)
    }),
    http.post('*/api/trainings/:id/cancel', () => {
      cancels += 1
      current = { ...current, cancelled: true }
      return HttpResponse.json(current)
    }),
  )
  return { patches, cancels: () => cancels }
}

describe('edit training', () => {
  beforeEach(async () => {
    await storeLoginToken('admin@cofinpro.pt')
  })

  it('reuses the form, pre-filled with the training (times in local time)', async () => {
    serveTraining(training)
    renderRoute('/admin/trainings/12/edit')

    expect(await screen.findByRole('heading', { name: 'Edit training' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('React Basics')
    expect(screen.getByLabelText('Description')).toHaveValue('Hooks, state and effects.')
    expect(screen.getByLabelText('Starts')).toHaveValue('2030-10-15T09:00')
    expect(screen.getByLabelText('Ends')).toHaveValue('2030-10-15T12:00')
    expect(screen.getByRole('combobox', { name: 'Trainer' })).toHaveValue('Sofia Martins')
    const levels = screen.getByRole('group', { name: 'Levels' })
    expect(within(levels).getByLabelText('Junior')).toBeChecked()
    expect(within(levels).getByLabelText('Expert')).toBeChecked()
    expect(within(levels).getByLabelText('Senior')).not.toBeChecked()
    expect(screen.getByLabelText('Max seats')).toHaveValue(12)
  })

  it('sends only the changed fields and goes back to the training', async () => {
    const { patches } = serveTraining(training)
    const user = userEvent.setup()
    const { router } = renderRoute('/admin/trainings/12/edit')
    const name = await screen.findByLabelText('Name')

    await user.clear(name)
    await user.type(name, 'React Basics II')
    await user.clear(screen.getByLabelText('Max seats'))
    await user.type(screen.getByLabelText('Max seats'), '20')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/trainings/12'))
    expect(patches).toEqual([{ name: 'React Basics II', max_seats: 20 }])
  })

  it('switching to External sends both trainer fields', async () => {
    const { patches } = serveTraining(training)
    const user = userEvent.setup()
    const { router } = renderRoute('/admin/trainings/12/edit')
    const trainer = await screen.findByRole('combobox', { name: 'Trainer' })

    await user.clear(trainer)
    await user.click(await screen.findByRole('option', { name: /External/ }))
    await user.type(screen.getByLabelText('External trainer name (optional)'), 'Acme Academy')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/trainings/12'))
    expect(patches).toEqual([{ trainer_id: null, external_trainer_name: 'Acme Academy' }])
  })

  it('lets a past training be fixed without moving its start', async () => {
    const { patches } = serveTraining({ ...training, starts_at: '2020-01-01T09:00:00Z', ends_at: '2020-01-01T12:00:00Z' })
    const user = userEvent.setup()
    const { router } = renderRoute('/admin/trainings/12/edit')
    const description = await screen.findByLabelText('Description')

    await user.type(description, ' Updated.')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/trainings/12'))
    expect(patches).toEqual([{ description: 'Hooks, state and effects. Updated.' }])
  })

  it("shows the API's message when the change conflicts", async () => {
    serveTraining(training)
    server.use(
      http.patch('*/api/trainings/:id', () =>
        HttpResponse.json(
          { detail: { code: 'max_seats_below_approved', message: 'More people are approved than that' } },
          { status: 409 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderRoute('/admin/trainings/12/edit')
    const seats = await screen.findByLabelText('Max seats')

    await user.clear(seats)
    await user.type(seats, '1')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('More people are approved than that')
  })
})

describe('cancel training', () => {
  it('asks for confirmation, then shows the training as cancelled', async () => {
    const { cancels } = serveTraining(training)
    await storeLoginToken('admin@cofinpro.pt')
    const user = userEvent.setup()
    renderRoute('/trainings/12')

    await user.click(await screen.findByRole('button', { name: 'Cancel training' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel “React Basics”?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel training' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This training was cancelled')
    expect(within(screen.getByRole('complementary', { name: 'Your place' })).getByRole('button', { name: 'Cancelled' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Cancel training' })).not.toBeInTheDocument()
    expect(cancels()).toBe(1)
  })

  it('does nothing when the admin keeps it', async () => {
    const { cancels } = serveTraining(training)
    await storeLoginToken('admin@cofinpro.pt')
    const user = userEvent.setup()
    renderRoute('/trainings/12')

    await user.click(await screen.findByRole('button', { name: 'Cancel training' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep it' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(cancels()).toBe(0)
  })

  it('shows why the API refused, inside the dialog', async () => {
    serveTraining(training)
    server.use(
      http.post('*/api/trainings/:id/cancel', () =>
        HttpResponse.json({ detail: { code: 'training_started', message: 'This training has already started' } }, { status: 409 }),
      ),
    )
    await storeLoginToken('admin@cofinpro.pt')
    const user = userEvent.setup()
    renderRoute('/trainings/12')

    await user.click(await screen.findByRole('button', { name: 'Cancel training' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel training' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This training has already started')
  })

  it('offers Edit and Cancel to admins only', async () => {
    serveTraining(training)
    await storeLoginToken('joao@cofinpro.pt')
    renderRoute('/trainings/12')

    await screen.findByRole('heading', { name: 'React Basics', level: 1 })
    expect(screen.queryByRole('button', { name: 'Cancel training' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Edit training' })).not.toBeInTheDocument()
  })

  it('shows a Cancelled badge on the card in the list', async () => {
    server.use(http.get('*/api/trainings', () => HttpResponse.json([{ ...training, cancelled: true }])))
    await storeLoginToken('admin@cofinpro.pt')
    renderRoute('/trainings')

    const card = (await screen.findByRole('heading', { name: 'React Basics' })).closest('article')!
    expect(within(card).getByText('Cancelled')).toBeInTheDocument()
  })
})

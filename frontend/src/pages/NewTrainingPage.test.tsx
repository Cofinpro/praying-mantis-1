import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TrainingCreate } from '../api/trainings'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

// Captures what the form sends, and answers like the backend does.
function captureCreate() {
  const sent: TrainingCreate[] = []
  server.use(
    http.post('*/api/trainings', async ({ request }) => {
      sent.push((await request.json()) as TrainingCreate)
      return HttpResponse.json({ id: 42 }, { status: 201 })
    }),
  )
  return sent
}

// jsdom has no date picker, so the value is set the way the browser reports it: "YYYY-MM-DDTHH:mm".
function setDateTime(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'React Basics')
  await user.type(screen.getByLabelText('Description'), 'Hooks, state and effects.')
  setDateTime('Starts', '2030-10-14T09:00')
  setDateTime('Ends', '2030-10-14T12:00')
  await user.type(screen.getByRole('combobox', { name: 'Trainer' }), 'sofia')
  await user.click(await screen.findByRole('option', { name: /Sofia Martins/ }))
  const levels = screen.getByRole('group', { name: 'Levels' })
  await user.click(within(levels).getByLabelText('Senior'))
  await user.click(within(levels).getByLabelText('Architect'))
  await user.type(screen.getByLabelText('Max seats'), '12')
}

describe('create-training form', () => {
  beforeEach(async () => {
    await storeLoginToken('admin@preyingmantis.test')
  })

  it('sends the training with UTC times and goes to its page', async () => {
    const sent = captureCreate()
    const user = userEvent.setup()
    const { router } = renderRoute('/admin/trainings/new')
    await screen.findByRole('heading', { name: 'New training' })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Create training' }))

    await screen.findByRole('heading', { name: 'Training 42' })
    expect(router.state.location.pathname).toBe('/trainings/42')
    expect(sent).toEqual([
      {
        name: 'React Basics',
        description: 'Hooks, state and effects.',
        // 09:00 in Lisbon in October is 08:00 UTC (summer time, UTC+1)
        starts_at: '2030-10-14T08:00:00.000Z',
        ends_at: '2030-10-14T11:00:00.000Z',
        max_seats: 12,
        trainer_id: 2,
        external_trainer_name: null,
        levels: ['senior', 'architect'],
      },
    ])
  })

  it('sends an External trainer with the optional name', async () => {
    const sent = captureCreate()
    const user = userEvent.setup()
    renderRoute('/admin/trainings/new')
    await screen.findByRole('heading', { name: 'New training' })

    await fillValidForm(user)
    const trainer = screen.getByRole('combobox', { name: 'Trainer' })
    await user.clear(trainer)
    await user.click(await screen.findByRole('option', { name: /External/ }))
    await user.type(screen.getByLabelText('External trainer name (optional)'), 'Acme Academy')
    await user.click(screen.getByRole('button', { name: 'Create training' }))

    await screen.findByRole('heading', { name: 'Training 42' })
    expect(sent[0]).toMatchObject({ trainer_id: null, external_trainer_name: 'Acme Academy' })
  })

  it('keeps the trainer list open when you come back to the field right after leaving it', async () => {
    const user = userEvent.setup()
    renderRoute('/admin/trainings/new')
    await screen.findByRole('heading', { name: 'New training' })

    await user.click(screen.getByRole('combobox', { name: 'Trainer' }))
    await user.click(screen.getByLabelText('Name'))
    await user.click(screen.getByRole('combobox', { name: 'Trainer' }))
    // Longer than the 150 ms the list waits before closing after a blur
    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(screen.getByRole('listbox', { name: 'Trainers' })).toBeInTheDocument()
  })

  it('shows the agreed rules next to each field and sends nothing', async () => {
    const sent = captureCreate()
    const user = userEvent.setup()
    renderRoute('/admin/trainings/new')
    await screen.findByRole('heading', { name: 'New training' })

    setDateTime('Starts', '2030-10-14T09:00')
    setDateTime('Ends', '2030-10-14T08:00')
    await user.click(screen.getByRole('button', { name: 'Create training' }))

    expect(screen.getByLabelText('Name')).toHaveAccessibleDescription('Enter a name')
    expect(screen.getByLabelText('Description')).toHaveAccessibleDescription('Enter a description')
    expect(screen.getByLabelText('Ends')).toHaveAccessibleDescription('End must be after start')
    expect(screen.getByRole('combobox', { name: 'Trainer' })).toHaveAccessibleDescription('Pick a trainer, or External')
    expect(screen.getByRole('group', { name: 'Levels' })).toHaveAccessibleDescription('Choose at least one level')
    expect(screen.getByLabelText('Max seats')).toHaveAccessibleDescription('Enter at least 1 seat')
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix 6 fields')
    expect(sent).toEqual([])
  })

  it('rejects a start in the past', async () => {
    const user = userEvent.setup()
    renderRoute('/admin/trainings/new')
    await screen.findByRole('heading', { name: 'New training' })

    setDateTime('Starts', '2020-01-01T09:00')
    await user.click(screen.getByRole('button', { name: 'Create training' }))

    expect(screen.getByLabelText('Starts')).toHaveAccessibleDescription('Start must be in the future')
  })

  it("puts the server's 422 errors next to the right fields", async () => {
    server.use(
      http.post('*/api/trainings', () =>
        HttpResponse.json(
          {
            detail: [
              { type: 'trainer_not_found', loc: ['body', 'trainer_id'], msg: 'No user with this id' },
              { type: 'value_error', loc: ['body'], msg: 'Value error, ends_at must be after starts_at' },
            ],
          },
          { status: 422 },
        ),
      ),
    )
    const user = userEvent.setup()
    const { router } = renderRoute('/admin/trainings/new')
    await screen.findByRole('heading', { name: 'New training' })

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: 'Create training' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please fix 2 fields')
    expect(screen.getByRole('combobox', { name: 'Trainer' })).toHaveAccessibleDescription('No user with this id')
    expect(screen.getByLabelText('Ends')).toHaveAccessibleDescription('ends_at must be after starts_at')
    expect(router.state.location.pathname).toBe('/admin/trainings/new')
  })
})

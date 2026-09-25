import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { MyEnrollments } from '../api/enrollments'
import type { TrainingSummary } from '../api/trainings'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

function training(id: number, name: string, status: TrainingSummary['my_enrollment_status']): TrainingSummary {
  return {
    id,
    name,
    starts_at: '2030-10-15T08:00:00Z',
    ends_at: '2030-10-15T11:00:00Z',
    levels: ['junior'],
    trainer: { id: 2, name: 'Sofia Martins' },
    external_trainer_name: null,
    max_seats: 12,
    seats_left: 4,
    cancelled: false,
    my_enrollment_status: status,
  }
}

function serveMine(mine: MyEnrollments) {
  server.use(http.get('*/api/me/enrollments', () => HttpResponse.json(mine)))
}

async function openProfile(email = 'joao@preyingmantis.test') {
  await storeLoginToken(email)
  renderRoute('/profile')
  return screen.findByRole('heading', { name: 'Profile' })
}

const section = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) })

describe('profile', () => {
  it('shows my name, email, client, level and team lead from /me', async () => {
    serveMine({ upcoming: [], pending: [], completed: [] })
    await openProfile()

    const details = screen.getByRole('region', { name: 'Your details' })
    expect(within(details).getByText('João Silva')).toBeInTheDocument()
    expect(within(details).getByText('joao@preyingmantis.test')).toBeInTheDocument()
    expect(within(details).getByText('DKB')).toBeInTheDocument()
    expect(within(details).getByText('Junior')).toBeInTheDocument()
    expect(within(details).getByText('Sofia Martins')).toBeInTheDocument()
  })

  it('says who approves when there is no team lead', async () => {
    serveMine({ upcoming: [], pending: [], completed: [] })
    await openProfile('rafael@preyingmantis.test')

    expect(screen.getByText('None (an admin approves your requests)')).toBeInTheDocument()
  })

  it('shows Upcoming, Pending and Completed sections with training cards', async () => {
    serveMine({
      upcoming: [training(1, 'React Basics', 'approved'), training(2, 'Clean Architecture', 'approved')],
      pending: [training(3, 'FastAPI in Practice', 'pending')],
      completed: [training(4, 'Git Beyond the Basics', 'approved')],
    })
    await openProfile()

    const upcoming = await screen.findByRole('region', { name: 'Upcoming 2' })
    expect(within(upcoming).getByRole('link', { name: 'React Basics' })).toHaveAttribute('href', '/trainings/1')
    expect(within(upcoming).getByRole('link', { name: 'Clean Architecture' })).toBeInTheDocument()
    expect(within(section('Pending')).getByRole('link', { name: 'FastAPI in Practice' })).toBeInTheDocument()
    const completed = section('Completed')
    expect(within(completed).getByRole('link', { name: 'Git Beyond the Basics' })).toBeInTheDocument()
    expect(within(completed).getByText('Completed', { selector: 'span' })).toBeInTheDocument()
  })

  it('shows an empty state for each section', async () => {
    serveMine({ upcoming: [], pending: [], completed: [] })
    await openProfile()

    expect(await screen.findByText('No upcoming trainings. Request one from Trainings.')).toBeInTheDocument()
    expect(screen.getByText('No requests waiting for a decision.')).toBeInTheDocument()
    expect(screen.getByText('No completed trainings yet.')).toBeInTheDocument()
  })
})

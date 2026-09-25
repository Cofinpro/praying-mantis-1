import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { FeedbackSummary, TrainingRead } from '../api/trainings'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

const pastTraining: TrainingRead = {
  id: 12,
  name: 'React Basics',
  description: 'Hooks.',
  starts_at: '2020-10-15T08:00:00Z',
  ends_at: '2020-10-15T11:00:00Z',
  levels: ['junior'],
  trainer: { id: 2, name: 'Sofia Martins' },
  external_trainer_name: null,
  max_seats: 12,
  seats_left: 4,
  rating_count: 2,
  average_rating: 4.5,
  my_rating: null,
  cancelled: false,
  my_enrollment_status: 'approved',
  my_enrollment_id: 77,
}

// A small stateful backend: GET the training and its feedback, PUT changes my rating
function serveFeedback(initial: Partial<FeedbackSummary> = {}) {
  let summary: FeedbackSummary = { average_rating: 4.5, rating_count: 2, mine: null, can_rate: true, comments: null, ...initial }
  const sent: unknown[] = []
  server.use(
    http.get('*/api/trainings/:id', () => HttpResponse.json(pastTraining)),
    http.get('*/api/trainings/:id/feedback', () => HttpResponse.json(summary)),
    http.put('*/api/trainings/:id/feedback', async ({ request }) => {
      const body = (await request.json()) as { rating: number; comment: string | null }
      sent.push(body)
      const mine = { ...body, created_at: '2020-10-16T08:00:00Z', updated_at: '2020-10-16T08:00:00Z' }
      summary = { ...summary, mine, rating_count: summary.rating_count + (summary.mine ? 0 : 1) }
      return HttpResponse.json(mine)
    }),
  )
  return sent
}

async function openDetail(email = 'joao@cofinpro.pt') {
  await storeLoginToken(email)
  renderRoute('/trainings/12')
  return screen.findByRole('region', { name: 'Feedback' })
}

describe('training feedback', () => {
  it('shows the average and count to everyone', async () => {
    serveFeedback({ can_rate: false })
    const section = await openDetail()

    expect(within(section).getByLabelText('Rated 4.5 out of 5 by 2 people')).toBeInTheDocument()
    expect(within(section).queryByRole('group', { name: 'How was it?' })).not.toBeInTheDocument()
  })

  it('lets someone who completed it rate and comment', async () => {
    const sent = serveFeedback()
    const user = userEvent.setup()
    const section = await openDetail()

    await user.click(within(section).getByLabelText('4 stars'))
    await user.type(within(section).getByLabelText('Comment (optional)'), 'Good pace')
    await user.click(within(section).getByRole('button', { name: 'Send feedback' }))

    expect(await within(section).findByText('Thanks for your feedback!')).toBeInTheDocument()
    expect(sent).toEqual([{ rating: 4, comment: 'Good pace' }])
  })

  it('asks for stars before sending', async () => {
    const sent = serveFeedback()
    const user = userEvent.setup()
    const section = await openDetail()

    await user.click(within(section).getByRole('button', { name: 'Send feedback' }))

    expect(within(section).getByRole('alert')).toHaveTextContent('Choose from 1 to 5 stars')
    expect(sent).toEqual([])
  })

  it('pre-fills my earlier rating so I can update it', async () => {
    serveFeedback({ mine: { rating: 3, comment: 'Too fast', created_at: '2020-10-16T08:00:00Z', updated_at: '2020-10-16T08:00:00Z' } })
    const section = await openDetail()

    expect(within(section).getByLabelText('3 stars')).toBeChecked()
    expect(within(section).getByLabelText('Comment (optional)')).toHaveValue('Too fast')
    expect(within(section).getByRole('button', { name: 'Update feedback' })).toBeInTheDocument()
  })

  it('shows the comments with names to admins and the trainer', async () => {
    serveFeedback({
      can_rate: false,
      comments: [
        {
          rating: 5,
          comment: 'Loved it',
          created_at: '2020-10-16T08:00:00Z',
          updated_at: '2020-10-16T08:00:00Z',
          user: { id: 7, name: 'Pedro Alves', avatar_url: null },
        },
      ],
    })
    const section = await openDetail('admin@cofinpro.pt')

    const comments = within(section).getByRole('list', { name: 'Comments' })
    expect(comments).toHaveTextContent('Pedro Alves')
    expect(comments).toHaveTextContent('Loved it')
  })

  it('shows the rating on the training card', async () => {
    server.use(http.get('*/api/trainings', () => HttpResponse.json([pastTraining])))
    await storeLoginToken('admin@cofinpro.pt')
    renderRoute('/trainings')

    const card = (await screen.findByRole('heading', { name: 'React Basics' })).closest('article')!
    expect(within(card).getByLabelText('Rated 4.5 out of 5 by 2 people')).toBeInTheDocument()
  })
})

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ApprovalItem } from '../api/enrollments'
import type { TrainingSummary } from '../api/trainings'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

const training: TrainingSummary = {
  id: 12,
  name: 'React Basics',
  starts_at: '2030-10-15T08:00:00Z',
  ends_at: '2030-10-15T11:00:00Z',
  levels: ['junior'],
  trainer: { id: 2, name: 'Sofia Martins' },
  external_trainer_name: null,
  max_seats: 12,
  seats_left: 4,
  cancelled: false,
  my_enrollment_status: 'pending',
}

function request(id: number, name: string): ApprovalItem {
  return {
    enrollment: {
      id,
      training_id: 12,
      user_id: id,
      status: 'pending',
      decision_comment: null,
      // 13:30 UTC = 14:30 in Lisbon
      requested_at: '2030-10-01T13:30:00Z',
      decided_at: null,
    },
    user: { id, name },
    training,
  }
}

// Serves the given requests and records every decision the page sends.
function serveApprovals(items: ApprovalItem[]) {
  const decisions: { id: number; action: string; body: unknown }[] = []
  server.use(
    http.get('*/api/approvals', () => HttpResponse.json(items)),
    http.post('*/api/enrollments/:id/:action', async ({ params, request: req }) => {
      decisions.push({ id: Number(params.id), action: String(params.action), body: await req.json() })
      return HttpResponse.json({ ...items[0].enrollment, id: Number(params.id), status: 'approved' })
    }),
  )
  return decisions
}

async function openApprovals() {
  await storeLoginToken('sofia@preyingmantis.test')
  renderRoute('/approvals')
}

const row = (name: string) => screen.getByRole('article', { name })

describe('approvals', () => {
  it('lists each request with employee, training, requested at, comment and Approve / Reject', async () => {
    serveApprovals([request(5, 'João Silva'), request(6, 'Marta Lopes')])
    await openApprovals()

    const joao = await screen.findByRole('article', { name: 'João Silva' })
    expect(within(joao).getByText('React Basics')).toBeInTheDocument()
    expect(within(joao).getByText('Requested Tue 1 Oct 2030 · 14:30')).toBeInTheDocument()
    expect(within(joao).getByLabelText('Comment (optional)')).toBeInTheDocument()
    expect(within(joao).getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(within(joao).getByRole('button', { name: 'Reject' })).toBeInTheDocument()
    expect(row('Marta Lopes')).toBeInTheDocument()
  })

  it('shows "Nothing to approve" when there are no requests', async () => {
    serveApprovals([])
    await openApprovals()

    expect(await screen.findByText('Nothing to approve')).toBeInTheDocument()
  })

  it('sends the comment with an approval, and the row disappears without a reload', async () => {
    const decisions = serveApprovals([request(5, 'João Silva'), request(6, 'Marta Lopes')])
    const user = userEvent.setup()
    await openApprovals()
    const joao = await screen.findByRole('article', { name: 'João Silva' })

    await user.type(within(joao).getByLabelText('Comment (optional)'), 'Enjoy!')
    await user.click(within(joao).getByRole('button', { name: 'Approve' }))

    expect(await screen.findByRole('article', { name: 'Marta Lopes' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'João Silva' })).not.toBeInTheDocument()
    expect(decisions).toEqual([{ id: 5, action: 'approve', body: { comment: 'Enjoy!' } }])
  })

  it('sends the comment with a rejection too', async () => {
    const decisions = serveApprovals([request(5, 'João Silva')])
    const user = userEvent.setup()
    await openApprovals()
    const joao = await screen.findByRole('article', { name: 'João Silva' })

    await user.type(within(joao).getByLabelText('Comment (optional)'), 'Next time')
    await user.click(within(joao).getByRole('button', { name: 'Reject' }))

    expect(await screen.findByText('Nothing to approve')).toBeInTheDocument()
    expect(decisions).toEqual([{ id: 5, action: 'reject', body: { comment: 'Next time' } }])
  })

  it('keeps the row and says why when the training is full', async () => {
    serveApprovals([request(5, 'João Silva')])
    server.use(
      http.post('*/api/enrollments/:id/approve', () =>
        HttpResponse.json({ detail: { code: 'training_full', message: 'This training is full' } }, { status: 409 }),
      ),
    )
    await openApprovals()
    const joao = await screen.findByRole('article', { name: 'João Silva' })

    await userEvent.click(within(joao).getByRole('button', { name: 'Approve' }))

    expect(await within(joao).findByRole('alert')).toHaveTextContent('Sorry, this training just filled up.')
    expect(row('João Silva')).toBeInTheDocument()
  })
})

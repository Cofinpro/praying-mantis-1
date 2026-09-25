import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { submitExpense, type Expense } from '../api/expenses'
import { server } from '../mocks/server'
import { renderRoute, storeLoginToken } from '../test/render'

// jsdom's fetch can't send multipart bodies through MSW (see Classroom.md → war stories): stub the submit
vi.mock('../api/expenses', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/expenses')>()),
  submitExpense: vi.fn(),
}))

const sofia = { id: 2, name: 'Sofia Martins', avatar_url: null }
const joao = { id: 5, name: 'João Silva', avatar_url: null }
const helena = { id: 18, name: 'Helena Ribeiro', avatar_url: null }

const expense = (fields: Partial<Expense> = {}): Expense => ({
  id: 7,
  title: 'Taxi to the client',
  description: null,
  category: 'travel',
  amount: '18.40',
  currency: 'EUR',
  spent_on: '2026-09-24',
  status: 'pending_lead',
  submitted_at: '2026-09-24T09:00:00Z',
  user: joao,
  waiting_for: 'Sofia Martins',
  lead_decision: null,
  hr_decision: null,
  rejection_reason: null,
  receipts: [{ id: 1, filename: 'taxi.pdf', content_type: 'application/pdf', size: 2048 }],
  ...fields,
})

describe('submitting an expense', () => {
  it('checks the form before sending', async () => {
    await storeLoginToken('joao@cofinpro.pt')
    renderRoute('/expenses/new')

    await userEvent.click(await screen.findByRole('button', { name: 'Send for approval' }))

    expect(screen.getByLabelText('What was it for?')).toHaveAccessibleDescription('Say what it was for')
    expect(screen.getByLabelText('Amount (€)')).toHaveAccessibleDescription('Enter an amount like 12.50')
    expect(screen.getByText('Choose a category')).toBeInTheDocument()
    expect(screen.getByText('Add at least one receipt')).toBeInTheDocument()
    expect(submitExpense).not.toHaveBeenCalled()
  })

  it('sends the fields and receipts, then opens the new expense', async () => {
    const created = expense({ title: 'Hotel in Frankfurt', amount: '245.50' })
    vi.mocked(submitExpense).mockResolvedValueOnce(created)
    server.use(http.get('*/api/expenses/7', () => HttpResponse.json(created)))
    await storeLoginToken('joao@cofinpro.pt')
    const { router } = renderRoute('/expenses/new')

    await userEvent.type(await screen.findByLabelText('What was it for?'), 'Hotel in Frankfurt')
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'accommodation')
    await userEvent.type(screen.getByLabelText('Amount (€)'), '245,5')
    const receipt = new File(['%PDF'], 'hotel.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByTestId('receipt-input'), receipt)
    expect(within(screen.getByRole('list', { name: 'Chosen receipts' })).getByText('hotel.pdf')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send for approval' }))

    expect(submitExpense).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Hotel in Frankfurt', category: 'accommodation', amount: '245.50' }), // "245,5" → "245.50"
      [receipt],
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/expenses/7'))
    expect(await screen.findByRole('heading', { name: 'Hotel in Frankfurt' })).toBeInTheDocument()
  })
})

describe('my expenses', () => {
  it('lists them with amount, status and who has them now', async () => {
    server.use(http.get('*/api/me/expenses', () => HttpResponse.json([expense()])))
    await storeLoginToken('joao@cofinpro.pt')
    renderRoute('/expenses')

    const row = (await screen.findByRole('link', { name: 'Taxi to the client' })).closest('li')!
    expect(row).toHaveTextContent('€18.40')
    expect(row).toHaveTextContent('Waiting for team lead')
    expect(row).toHaveTextContent('with Sofia Martins')
  })

  it('shows both approvals on a finished expense', async () => {
    const approved = expense({
      status: 'approved',
      waiting_for: null,
      lead_decision: { by: sofia, at: '2026-09-24T12:00:00Z', approved: true },
      hr_decision: { by: helena, at: '2026-09-25T09:00:00Z', approved: true },
    })
    server.use(http.get('*/api/expenses/7', () => HttpResponse.json(approved)))
    await storeLoginToken('joao@cofinpro.pt')
    renderRoute('/expenses/7')

    const progress = await screen.findByRole('region', { name: 'Progress' })
    expect(within(progress).getByText('Approved by team lead')).toBeInTheDocument()
    expect(within(progress).getByText(/Sofia Martins/)).toBeInTheDocument()
    expect(within(progress).getByText('Approved by HR')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Withdraw expense' })).not.toBeInTheDocument()
  })

  it('shows why an expense was rejected', async () => {
    const rejected = expense({
      status: 'rejected',
      waiting_for: null,
      lead_decision: { by: sofia, at: '2026-09-24T12:00:00Z', approved: false },
      rejection_reason: 'This was a personal trip',
    })
    server.use(http.get('*/api/expenses/7', () => HttpResponse.json(rejected)))
    await storeLoginToken('joao@cofinpro.pt')
    renderRoute('/expenses/7')

    expect(await screen.findByText('This was a personal trip')).toBeInTheDocument()
    expect(screen.getByText('Rejected by team lead')).toBeInTheDocument()
  })

  it('can be withdrawn while pending', async () => {
    let current = expense()
    server.use(
      http.get('*/api/expenses/7', () => HttpResponse.json(current)),
      http.post('*/api/expenses/7/withdraw', () => {
        current = { ...current, status: 'withdrawn', waiting_for: null }
        return HttpResponse.json(current)
      }),
    )
    await storeLoginToken('joao@cofinpro.pt')
    renderRoute('/expenses/7')

    await userEvent.click(await screen.findByRole('button', { name: 'Withdraw expense' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Withdraw this expense?' })).getByRole('button', { name: 'Withdraw' }))

    expect(await screen.findByText('Withdrawn', { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Withdraw expense' })).not.toBeInTheDocument()
  })
})

describe('approving expenses', () => {
  it('lets the team lead approve, and the row leaves', async () => {
    const approve = vi.fn()
    server.use(
      http.get('*/api/approvals', () => HttpResponse.json([])),
      http.get('*/api/expense-approvals', () => HttpResponse.json([expense()])),
      http.post('*/api/expenses/7/approve', () => {
        approve()
        return HttpResponse.json(expense({ status: 'pending_hr', waiting_for: 'HR' }))
      }),
    )
    await storeLoginToken('sofia@cofinpro.pt')
    renderRoute('/approvals')

    const row = await screen.findByRole('article', { name: 'João Silva' })
    expect(row).toHaveTextContent('Team lead approval')
    expect(within(row).getByRole('button', { name: 'Download taxi.pdf' })).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: 'Approve' }))

    expect(await screen.findByText('No expenses to approve')).toBeInTheDocument()
    expect(approve).toHaveBeenCalledOnce()
  })

  it('needs a reason to reject, and sends it', async () => {
    const reasons: unknown[] = []
    server.use(
      http.get('*/api/approvals', () => HttpResponse.json([])),
      http.get('*/api/expense-approvals', () => HttpResponse.json([expense()])),
      http.post('*/api/expenses/7/reject', async ({ request }) => {
        reasons.push(await request.json())
        return HttpResponse.json(expense({ status: 'rejected' }))
      }),
    )
    await storeLoginToken('sofia@cofinpro.pt')
    renderRoute('/approvals')
    const row = await screen.findByRole('article', { name: 'João Silva' })

    await userEvent.click(within(row).getByRole('button', { name: 'Reject' }))
    expect(within(row).getByLabelText('Reason (needed to reject)')).toHaveAccessibleDescription('Say why, so they can fix it')
    expect(reasons).toEqual([])

    await userEvent.type(within(row).getByLabelText('Reason (needed to reject)'), 'Personal trip')
    await userEvent.click(within(row).getByRole('button', { name: 'Reject' }))

    await waitFor(() => expect(reasons).toEqual([{ reason: 'Personal trip' }]))
  })

  it('shows HR the second step, and no training requests', async () => {
    const atHr = expense({ status: 'pending_hr', waiting_for: 'HR', lead_decision: { by: sofia, at: '2026-09-24T12:00:00Z', approved: true } })
    server.use(http.get('*/api/expense-approvals', () => HttpResponse.json([atHr])))
    await storeLoginToken('helena@cofinpro.pt')
    renderRoute('/approvals')

    const row = await screen.findByRole('article', { name: 'João Silva' })
    expect(row).toHaveTextContent('HR approval · approved by Sofia Martins')
    expect(screen.queryByRole('heading', { name: 'Training requests' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Approvals' })).toBeInTheDocument() // HR sees the nav item
  })
})

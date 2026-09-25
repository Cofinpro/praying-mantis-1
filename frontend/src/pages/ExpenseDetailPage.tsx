import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { ApiError } from '../api/client'
import { getExpense, withdrawExpense, type Expense } from '../api/expenses'
import { queryKeys } from '../api/queryClient'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { BackLink } from '../components/BackLink'
import { Button } from '../components/Button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ExpenseStatusBadge } from '../components/ExpenseStatusBadge'
import { ReceiptList } from '../components/ReceiptList'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { canWithdrawExpense, CATEGORY_LABELS, formatMoney } from '../expenses/display'
import { formatDateTime } from '../lib/datetime'
import { formatDay } from '../lib/days'
import styles from './ExpenseDetailPage.module.css'

type Step = { label: string; state: 'done' | 'rejected' | 'current' | 'waiting'; detail: string }

// Submitted → team lead → HR, as the submitter and the approvers see it. Derived from the expense on each render.
function expenseSteps(expense: Expense): Step[] {
  const steps: Step[] = [
    { label: 'Submitted', state: 'done', detail: `${expense.user.name} · ${formatDateTime(expense.submitted_at)}` },
  ]
  const closed = expense.status === 'rejected' || expense.status === 'withdrawn'
  const lead = expense.lead_decision
  if (lead) {
    steps.push({
      label: lead.approved ? 'Approved by team lead' : 'Rejected by team lead',
      state: lead.approved ? 'done' : 'rejected',
      detail: `${lead.by?.name ?? 'Someone'} · ${formatDateTime(lead.at)}`,
    })
  } else if (expense.status === 'pending_lead') {
    steps.push({ label: 'Team lead', state: 'current', detail: `Waiting for ${expense.waiting_for}` })
  }
  const hr = expense.hr_decision
  if (hr) {
    steps.push({
      label: hr.approved ? 'Approved by HR' : 'Rejected by HR',
      state: hr.approved ? 'done' : 'rejected',
      detail: `${hr.by?.name ?? 'Someone'} · ${formatDateTime(hr.at)}`,
    })
  } else if (!closed) {
    steps.push({
      label: 'HR',
      state: expense.status === 'pending_hr' ? 'current' : 'waiting',
      detail: expense.status === 'pending_hr' ? 'Waiting for HR' : 'After the team lead',
    })
  }
  if (expense.status === 'withdrawn') steps.push({ label: 'Withdrawn', state: 'rejected', detail: 'By the submitter' })
  return steps
}

// /expenses/:id: for the submitter, their team lead, whoever decided it, HR and admins.
export function ExpenseDetailPage() {
  const id = Number(useParams().id)
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const expense = useQuery({ queryKey: queryKeys.expense(id), queryFn: () => getExpense(id) })
  const withdraw = useMutation({
    mutationFn: () => withdrawExpense(id),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.expense(id), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.myExpenses })
      setConfirming(false)
    },
  })

  if (expense.isPending) {
    return (
      <p className={styles.muted} role="status">
        Loading the expense…
      </p>
    )
  }
  if (expense.isError) {
    const notFound = expense.error instanceof ApiError && expense.error.status === 404
    return (
      <div className={styles.page}>
        <BackLink to="/expenses">All expenses</BackLink>
        <Alert title={notFound ? 'Expense not found' : "Couldn't load the expense"}>
          {notFound ? "It doesn't exist, or it isn't yours to see." : 'Check your connection and try again.'}
        </Alert>
      </div>
    )
  }

  const data = expense.data
  const mine = user?.id === data.user.id

  return (
    <div className={styles.page}>
      <BackLink to={mine ? '/expenses' : '/approvals'}>{mine ? 'All expenses' : 'Approvals'}</BackLink>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{data.title}</h1>
          <p className={styles.muted}>
            {CATEGORY_LABELS[data.category]} · {formatDay(data.spent_on)}
            {!mine && ` · ${data.user.name}`}
          </p>
        </div>
        <div className={styles.money}>
          <span className={styles.amount}>{formatMoney(data.amount)}</span>
          <ExpenseStatusBadge status={data.status} />
        </div>
      </header>

      {data.status === 'rejected' && data.rejection_reason && (
        <Alert title="Rejected">{data.rejection_reason}</Alert>
      )}

      <div className={styles.card}>
        {data.description && (
          <section aria-labelledby="details-heading">
            <h2 id="details-heading" className={styles.sectionTitle}>
              Details
            </h2>
            <p className={styles.description}>{data.description}</p>
          </section>
        )}

        <section aria-labelledby="receipts-heading">
          <h2 id="receipts-heading" className={styles.sectionTitle}>
            Receipts
          </h2>
          <ReceiptList expenseId={data.id} receipts={data.receipts} />
        </section>

        <section aria-labelledby="progress-heading">
          <h2 id="progress-heading" className={styles.sectionTitle}>
            Progress
          </h2>
          <ol className={styles.steps}>
            {expenseSteps(data).map((step) => (
              <li key={step.label} className={`${styles.step} ${styles[step.state]}`}>
                <span className={styles.dot} aria-hidden="true" />
                <div>
                  <p className={styles.stepLabel}>{step.label}</p>
                  <p className={styles.muted}>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {user && canWithdrawExpense(data, user.id) && (
        <div>
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Withdraw expense
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title="Withdraw this expense?"
        confirmLabel="Withdraw"
        busy={withdraw.isPending}
        error={withdraw.isError ? enrollmentErrorMessage(withdraw.error) : null}
        onConfirm={() => withdraw.mutate()}
        onClose={() => {
          setConfirming(false)
          withdraw.reset()
        }}
      >
        {`Nobody needs to approve “${data.title}” any more. You can submit it again later.`}
      </ConfirmDialog>
    </div>
  )
}

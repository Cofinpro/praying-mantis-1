import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { approveExpense, rejectExpense, type Expense } from '../api/expenses'
import { queryKeys } from '../api/queryClient'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { CATEGORY_LABELS, formatMoney } from '../expenses/display'
import { formatDateTime } from '../lib/datetime'
import { formatDay } from '../lib/days'
import { Avatar } from './Avatar'
import { Button } from './Button'
import styles from './ApprovalRow.module.css'
import { ReceiptList } from './ReceiptList'
import { TextField } from './TextField'

type Decision = 'approve' | 'reject'

// Like ApprovalRow (same layout and styles), for an expense: who, what and how much, the receipts,
// and Approve / Reject. Rejecting needs a reason, because the submitter sees it.
export function ExpenseApprovalRow({ expense }: { expense: Expense }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const headingId = useId()
  const hrStep = expense.status === 'pending_hr'

  const decide = useMutation({
    mutationFn: (decision: Decision) =>
      decision === 'approve' ? approveExpense(expense.id) : rejectExpense(expense.id, reason.trim()),
    onSuccess: (updated) => {
      // Pessimistic, like training approvals: the row leaves once the server said yes
      queryClient.setQueryData<Expense[]>(queryKeys.expenseApprovals, (items) => items?.filter((e) => e.id !== expense.id))
      queryClient.setQueryData(queryKeys.expense(expense.id), updated)
    },
    // Decided by someone else meanwhile: refresh the list behind the message
    onError: () => void queryClient.invalidateQueries({ queryKey: queryKeys.expenseApprovals }),
  })

  function reject() {
    if (!reason.trim()) {
      setReasonError('Say why, so they can fix it')
      return
    }
    decide.mutate('reject')
  }

  return (
    <article className={styles.row} aria-labelledby={headingId}>
      <div className={styles.who}>
        <Avatar name={expense.user.name} src={expense.user.avatar_url} />
        <div className={styles.whoText}>
          <h3 id={headingId} className={styles.name}>
            {expense.user.name}
          </h3>
          <p className={styles.meta}>Submitted {formatDateTime(expense.submitted_at)}</p>
        </div>
      </div>
      <div className={styles.what}>
        <p className={styles.training}>
          <Link to={`/expenses/${expense.id}`}>{expense.title}</Link> · {formatMoney(expense.amount)}
        </p>
        <p className={styles.meta}>
          {CATEGORY_LABELS[expense.category]} · {formatDay(expense.spent_on)}
        </p>
        <p className={styles.meta}>
          {hrStep
            ? expense.lead_decision
              ? `HR approval · approved by ${expense.lead_decision.by?.name ?? 'the team lead'}`
              : 'HR approval · no team lead'
            : 'Team lead approval · HR approves after you'}
        </p>
        <ReceiptList expenseId={expense.id} receipts={expense.receipts} />
      </div>
      <div className={styles.decision}>
        <TextField
          label="Reason (needed to reject)"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setReasonError(null)
          }}
          placeholder="Shown to the employee"
          error={reasonError ?? undefined}
          disabled={decide.isPending}
        />
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={reject} disabled={decide.isPending}>
            Reject
          </Button>
          <Button onClick={() => decide.mutate('approve')} disabled={decide.isPending}>
            Approve
          </Button>
        </div>
        {decide.isError && (
          <p className={styles.error} role="alert">
            {enrollmentErrorMessage(decide.error)}
          </p>
        )}
      </div>
    </article>
  )
}

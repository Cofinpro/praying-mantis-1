import { useQuery } from '@tanstack/react-query'
import { listApprovals } from '../api/enrollments'
import { listExpenseApprovals } from '../api/expenses'
import { queryKeys } from '../api/queryClient'
import { useAuth } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { ApprovalRow } from '../components/ApprovalRow'
import { Button } from '../components/Button'
import { ExpenseApprovalRow } from '../components/ExpenseApprovalRow'
import { PageHeader } from '../components/PageHeader'
import styles from './ApprovalsPage.module.css'

export function ApprovalsPage() {
  const { user } = useAuth()
  // HR alone doesn't decide training requests (team leads and admins do), so it only sees expenses
  const decidesTrainings = Boolean(user && (user.is_team_lead || user.is_admin))

  return (
    <>
      <PageHeader title="Approvals">Requests waiting for your decision</PageHeader>
      {decidesTrainings && <TrainingRequests />}
      <ExpenseApprovals />
    </>
  )
}

function TrainingRequests() {
  const approvals = useQuery({ queryKey: queryKeys.approvals, queryFn: listApprovals })

  return (
    <section className={styles.section} aria-labelledby="training-requests">
      <h2 id="training-requests" className={styles.sectionTitle}>
        Training requests
      </h2>
      {approvals.isPending ? (
        <p className={styles.muted} role="status">
          Loading requests…
        </p>
      ) : approvals.isError ? (
        <div className={styles.error}>
          <Alert title="Couldn't load the requests">Check your connection and try again.</Alert>
          <Button onClick={() => approvals.refetch()}>Try again</Button>
        </div>
      ) : approvals.data.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>Nothing to approve</p>
          <p className={styles.muted}>New requests from your team show up here.</p>
        </div>
      ) : (
        <ul className={styles.list} aria-label="Pending requests">
          {/* key = the enrollment id: stable, so React keeps each row's comment with the right person
              when another row disappears. An array index here would shift the comments. */}
          {approvals.data.map((item) => (
            <li key={item.enrollment.id}>
              <ApprovalRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ExpenseApprovals() {
  const expenses = useQuery({ queryKey: queryKeys.expenseApprovals, queryFn: listExpenseApprovals })

  return (
    <section className={styles.section} aria-labelledby="expense-approvals">
      <h2 id="expense-approvals" className={styles.sectionTitle}>
        Expenses
      </h2>
      {expenses.isPending ? (
        <p className={styles.muted} role="status">
          Loading expenses…
        </p>
      ) : expenses.isError ? (
        <div className={styles.error}>
          <Alert title="Couldn't load the expenses">Check your connection and try again.</Alert>
          <Button onClick={() => expenses.refetch()}>Try again</Button>
        </div>
      ) : expenses.data.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No expenses to approve</p>
          <p className={styles.muted}>Expenses from your team, and those waiting for HR, show up here.</p>
        </div>
      ) : (
        <ul className={styles.list} aria-label="Expenses to approve">
          {expenses.data.map((expense) => (
            <li key={expense.id}>
              <ExpenseApprovalRow expense={expense} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { listMyExpenses } from '../api/expenses'
import { queryKeys } from '../api/queryClient'
import { Alert } from '../components/Alert'
import { ButtonLink } from '../components/Button'
import { ExpenseStatusBadge } from '../components/ExpenseStatusBadge'
import { PageHeader } from '../components/PageHeader'
import { CATEGORY_LABELS, formatMoney } from '../expenses/display'
import { formatDay } from '../lib/days'
import styles from './ExpensesPage.module.css'

// /expenses: my claims, newest first. Each opens its detail page.
export function ExpensesPage() {
  const expenses = useQuery({ queryKey: queryKeys.myExpenses, queryFn: listMyExpenses })

  return (
    <>
      <PageHeader title="Expenses" actions={<ButtonLink to="/expenses/new">+ New expense</ButtonLink>}>
        Claim back what you paid for work. Your team lead approves it first, then HR.
      </PageHeader>

      {expenses.isPending ? (
        <p className={styles.muted} role="status">
          Loading your expenses…
        </p>
      ) : expenses.isError ? (
        <Alert title="Couldn't load your expenses">Check your connection and try again.</Alert>
      ) : expenses.data.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No expenses yet</p>
          <p className={styles.muted}>Paid for a taxi, a hotel or a course? Add it with its receipt.</p>
        </div>
      ) : (
        <ul className={styles.list} aria-label="My expenses">
          {expenses.data.map((expense) => (
            <li key={expense.id} className={styles.row}>
              <div className={styles.what}>
                <Link to={`/expenses/${expense.id}`} className={styles.title}>
                  {expense.title}
                </Link>
                <span className={styles.muted}>
                  {CATEGORY_LABELS[expense.category]} · {formatDay(expense.spent_on)}
                  {expense.waiting_for && ` · with ${expense.waiting_for}`}
                </span>
              </div>
              <span className={styles.amount}>{formatMoney(expense.amount)}</span>
              <ExpenseStatusBadge status={expense.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

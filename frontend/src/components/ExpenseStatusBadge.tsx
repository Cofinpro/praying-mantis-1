import type { ExpenseStatus } from '../api/expenses'
import { STATUS_LABELS } from '../expenses/display'
import styles from './StatusBadge.module.css'

// The same pills as StatusBadge: purple while the team lead decides, blue while HR does.
const COLOURS: Record<ExpenseStatus, string> = {
  pending_lead: styles.pending,
  pending_hr: styles.waitlisted,
  approved: styles.approved,
  rejected: styles.rejected,
  withdrawn: styles.withdrawn,
}

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return <span className={`${styles.badge} ${COLOURS[status]}`}>{STATUS_LABELS[status]}</span>
}

import type { BadgeStatus } from '../trainings/display'
import styles from './StatusBadge.module.css'

const LABELS: Record<BadgeStatus, string> = {
  waitlisted: 'Waitlisted',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  cancelled: 'Cancelled',
}

// Figma "StatusBadge": the word is always there, so the colour is never the only signal.
export function StatusBadge({ status }: { status: BadgeStatus }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{LABELS[status]}</span>
}

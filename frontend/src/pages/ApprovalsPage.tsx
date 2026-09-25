import { useQuery } from '@tanstack/react-query'
import { listApprovals } from '../api/enrollments'
import { queryKeys } from '../api/queryClient'
import { Alert } from '../components/Alert'
import { ApprovalRow } from '../components/ApprovalRow'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import styles from './ApprovalsPage.module.css'

export function ApprovalsPage() {
  const approvals = useQuery({ queryKey: queryKeys.approvals, queryFn: listApprovals })

  return (
    <>
      <PageHeader title="Approvals">Requests waiting for your decision</PageHeader>
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
    </>
  )
}

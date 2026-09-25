import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { approveEnrollment, rejectEnrollment, type ApprovalItem } from '../api/enrollments'
import { queryKeys } from '../api/queryClient'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { formatDateTime, formatTrainingTime } from '../lib/datetime'
import { seatsLabel } from '../trainings/display'
import { Button } from './Button'
import styles from './ApprovalRow.module.css'
import { TextField } from './TextField'

type Decision = 'approve' | 'reject'

// Figma "ApprovalRow": who, which training, when they asked, an optional comment, Approve / Reject.
// Each row owns its comment and its mutation, so deciding one row never touches another's state.
export function ApprovalRow({ item }: { item: ApprovalItem }) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const headingId = useId()
  const { enrollment, user, training } = item

  const decide = useMutation({
    mutationFn: (decision: Decision) =>
      (decision === 'approve' ? approveEnrollment : rejectEnrollment)(enrollment.id, comment.trim() || null),
    onSuccess: () => {
      // Not optimistic: the row only leaves once the server said yes, so a "training full" can still show here.
      queryClient.setQueryData<ApprovalItem[]>(queryKeys.approvals, (items) =>
        items?.filter((i) => i.enrollment.id !== enrollment.id),
      )
      // Seats left and the employee's status changed
      void queryClient.invalidateQueries({ queryKey: queryKeys.trainings })
    },
    onError: () => {
      // Already decided elsewhere, or the training filled up: refresh seats and the list behind the message
      void queryClient.invalidateQueries({ queryKey: queryKeys.trainings })
    },
  })

  return (
    <article className={styles.row} aria-labelledby={headingId}>
      <div className={styles.who}>
        <h2 id={headingId} className={styles.name}>
          {user.name}
        </h2>
        <p className={styles.meta}>Requested {formatDateTime(enrollment.requested_at)}</p>
      </div>
      <div className={styles.what}>
        <p className={styles.training}>{training.name}</p>
        <p className={styles.meta}>
          {formatTrainingTime(training.starts_at, training.ends_at)} · {seatsLabel(training)}
        </p>
      </div>
      <div className={styles.decision}>
        <TextField
          label="Comment (optional)"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Shown to the employee"
          disabled={decide.isPending}
        />
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={() => decide.mutate('reject')} disabled={decide.isPending}>
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

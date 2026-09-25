import { useMutation, useQueryClient } from '@tanstack/react-query'
import { joinWaitlist, requestToJoin } from '../api/enrollments'
import { queryKeys } from '../api/queryClient'
import { useAuth } from '../auth/useAuth'
import type { TrainingSummary } from '../api/trainings'
import { CAN_SEND, JOIN_HINTS, JOIN_LABELS, joinState, waitlistHint } from '../enrollments/joinState'
import type { JoinState } from '../enrollments/joinState'
import { enrollmentErrorMessage } from '../enrollments/messages'
import { Button } from './Button'
import styles from './JoinButton.module.css'
import { WithdrawButton } from './WithdrawButton'

// "Request to join" (or "Join the waitlist" when full) and its disabled states, for the detail page's "Your place" panel.
export function JoinButton({ training }: { training: TrainingSummary }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const join = useMutation({
    // The state at click time picks the endpoint: a full training has a waitlist instead of requests
    mutationFn: (state: JoinState) => (state === 'join_waitlist' ? joinWaitlist : requestToJoin)(training.id),
    // Success or refusal, the training changed (my status, or seats): refetch the detail and every list,
    // so the badge updates everywhere. invalidateQueries matches every key that starts with ['trainings'].
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.trainings }),
  })

  // The trainer gives it, so there's nothing to join (they manage its materials instead)
  if (user && training.trainer?.id === user.id) {
    return <p className={styles.hint}>You’re the trainer of this training.</p>
  }

  const state = joinState(training)
  const hint = state === 'waitlisted' ? waitlistHint(training.my_waitlist_position) : JOIN_HINTS[state]
  const busyLabel = state === 'join_waitlist' ? 'Joining…' : 'Sending request…'

  return (
    <div className={styles.join}>
      <Button onClick={() => join.mutate(state)} disabled={!CAN_SEND.includes(state) || join.isPending}>
        {join.isPending ? busyLabel : JOIN_LABELS[state]}
      </Button>
      {hint && <p className={styles.hint}>{hint}</p>}
      <WithdrawButton training={training} />
      {join.isError && (
        <p className={styles.error} role="alert">
          {enrollmentErrorMessage(join.error)}
        </p>
      )}
    </div>
  )
}
